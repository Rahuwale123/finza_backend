const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

class AiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    
    // Define the tools (function declarations)
    this.toolDeclarations = [
      {
        functionDeclarations: [
          {
            name: "getDashboardSummary",
            description: "Get the user's financial summary including total balance, total spent, and total received.",
          },
          {
            name: "getRecentTransactions",
            description: "Get the user's most recent transactions (expenses and income).",
            parameters: {
              type: "OBJECT",
              properties: {
                limit: { type: "NUMBER", description: "Number of transactions to return (default 5)" }
              }
            }
          },
          {
            name: "getSpendByCategory",
            description: "Get spending breakdown by category for a specific period (week, month, or year).",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", enum: ["week", "month", "year"], description: "The time period to analyze" }
              }
            }
          },
          {
            name: "findTransaction",
            description: "Search for a specific transaction by its title or description to analyze it.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING", description: "Search term for the transaction title (e.g. 'Starbucks', 'Rent')" }
              }
            }
          }
        ]
      }
    ];

    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      tools: this.toolDeclarations,
    });
    
    // Mapping of tool names to their implementations
    this.functions = {
      getDashboardSummary: async (userId) => {
        const banks = await prisma.bankAccount.findMany({ where: { userId } });
        const transactions = await prisma.transaction.findMany({ where: { userId } });
        
        const totalBalance = banks.reduce((sum, b) => sum + b.balance, 0);
        const spentAmount = transactions.filter(t => t.isExpense).reduce((sum, t) => sum + t.amount, 0);
        const receivedAmount = transactions.filter(t => !t.isExpense).reduce((sum, t) => sum + t.amount, 0);
        
        return {
          totalBalance: `₹ ${totalBalance.toLocaleString('en-IN')}`,
          spentAmount: `₹ ${spentAmount.toLocaleString('en-IN')}`,
          receivedAmount: `₹ ${receivedAmount.toLocaleString('en-IN')}`,
          accountCount: banks.length,
          transactionCount: transactions.length
        };
      },
      
      getRecentTransactions: async (userId, args) => {
        const limit = args?.limit || 5;
        const transactions = await prisma.transaction.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: limit
        });
        
        return transactions.map(t => ({
          title: t.title,
          amount: `₹ ${t.amount.toLocaleString('en-IN')}`,
          type: t.isExpense ? 'Expense' : 'Income',
          category: t.category,
          date: t.date.toISOString().split('T')[0]
        }));
      },

      findTransaction: async (userId, args) => {
        const query = args?.query || '';
        const transactions = await prisma.transaction.findMany({
          where: { 
            userId,
            title: { contains: query, mode: 'insensitive' }
          },
          orderBy: { date: 'desc' },
          take: 3
        });
        
        return transactions.map(t => ({
          title: t.title,
          amount: `₹ ${t.amount.toLocaleString('en-IN')}`,
          type: t.isExpense ? 'Expense' : 'Income',
          category: t.category,
          date: t.date.toISOString().split('T')[0]
        }));
      },
      
      getSpendByCategory: async (userId, args) => {
        const period = args?.period || 'month';
        const now = new Date();
        let startDate = new Date();
        if (period === 'week') startDate.setDate(now.getDate() - 7);
        else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
        else if (period === 'year') startDate.setFullYear(now.getFullYear() - 1);
        
        const transactions = await prisma.transaction.findMany({
          where: { 
            userId, 
            isExpense: true,
            date: { gte: startDate }
          }
        });
        
        const categoryMap = {};
        transactions.forEach(t => {
          categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
        });
        
        return Object.keys(categoryMap).map(cat => ({
          category: cat,
          amount: `₹ ${categoryMap[cat].toLocaleString('en-IN')}`
        })).sort((a, b) => parseFloat(b.amount.replace(/[^0-9.-]+/g,"")) - parseFloat(a.amount.replace(/[^0-9.-]+/g,"")));
      }
    };
  }

  async chat(userId, message, history = []) {
    if (!process.env.GEMINI_API_KEY) {
      return { text: "Gemini API Key is missing. Please add it to your .env file." };
    }

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { 
        name: true,
        subscriptionType: true,
        subscriptionExpiry: true
      }
    });
    
    const isPremium = user?.subscriptionType !== 'FREE' && 
                     (!user?.subscriptionExpiry || user?.subscriptionExpiry > new Date());

    const userName = user?.name ?? "User";

    // Filter history to ensure it starts with 'user' role
    let cleanHistory = history;
    while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
      cleanHistory.shift();
    }

    const systemPrompt = `You are Finza AI, a helpful personal assistant and Financial Advisor for ${userName}. 
    Subscription Status: ${isPremium ? 'PREMIUM (Full Financial Advice Access - provide detailed, proactive, and advanced advice)' : 'FREE (Basic Advice - provide standard guidance and occasionally mention premium benefits for complex queries)'}
    You have tools to access the user's financial data. 

    ROLE AS FINANCIAL ADVISOR:
    - You can provide general financial advice based on the user's spending patterns.
    - If a user asks "Was this transaction worth it?" or similar, search for the transaction, look at the amount and category, and provide a thoughtful evaluation.
    - Consider factors like: Is it a recurring expense? Is it a high percentage of their total spend? Is it in a "Luxury" vs "Essential" category?
    - Be constructive and encouraging. Don't be judgmental, but help them save money or spend wiser.
    - If you don't have enough data, ask the user for more context (e.g. "How often do you visit this place?").

    GENERAL RULES:
    - IMPORTANT: Be a general-purpose AI. If the user just says "hi", "how are you", or asks general questions, respond normally and friendly WITHOUT using tools or showing financial data unless they specifically ask for it.
    - Only use financial tools when the user's query is related to their money, spending, balance, transactions, or financial advice.
    - Today's date is ${new Date().toISOString().split('T')[0]}.`;

    // Re-initialize model with instructions for this specific chat
    const modelWithInstructions = this.genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      tools: this.toolDeclarations,
      systemInstruction: systemPrompt 
    });

    const chat = modelWithInstructions.startChat({
      history: cleanHistory,
      generationConfig: {
        maxOutputTokens: 1000,
      },
    });

    try {
      let result = await chat.sendMessage(message);
      let response = result.response;
      
      // Handle potential function calls (Gemini might want to call tools)
      // Note: With 'gemini-2.0-flash', it might handle tool usage automatically if configured correctly, 
      // but let's implement the manual loop for maximum reliability.
      
      const MAX_ITERATIONS = 5;
      let iteration = 0;

      while (response.functionCalls() && iteration < MAX_ITERATIONS) {
        iteration++;
        const functionCalls = response.functionCalls();
        const toolResponses = [];

        for (const call of functionCalls) {
          const fnName = call.name;
          const args = call.args;
          
          if (this.functions[fnName]) {
            console.log(`AI calling tool: ${fnName} with args:`, args);
            const data = await this.functions[fnName](userId, args);
            toolResponses.push({
              functionResponse: {
                name: fnName,
                response: { result: data }
              }
            });
          }
        }

        if (toolResponses.length > 0) {
          result = await chat.sendMessage(toolResponses);
          response = result.response;
        } else {
          break;
        }
      }

      return { text: response.text() };
    } catch (error) {
      console.error("Gemini Error:", error);
      return { text: "Sorry, I encountered an error while processing your request." };
    }
  }
}

module.exports = new AiService();

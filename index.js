// ============================================================
//  WhatsApp Auto-Reply Bot · Powered by Gemini (google-genai)
// ============================================================

import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ خطأ: مفتاح GEMINI_API_KEY غير موجود في متغيرات البيئة!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_INSTRUCTIONS = `
أنت مساعد شخصي بشري يعمل نيابةً عن صاحب هذا الحساب.
قواعد صارمة:
1. تحدّث كإنسان طبيعي ودافئ.
2. ممنوع منعاً باتاً ذكر أنك ذكاء اصطناعي أو بوت أو جيمني.
3. الردود قصيرة ومختصرة (2-4 جمل) ومناسبة لواتساب.
`;

const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 10;

async function generateReply(senderId, userMessage) {
  try {
    if (!conversationHistory.has(senderId)) {
      conversationHistory.set(senderId, []);
    }
    const history = conversationHistory.get(senderId);
    history.push({ role: "user", parts: [{ text: userMessage }] });

    if (history.length > MAX_HISTORY_MESSAGES * 2) {
      history.splice(0, 2);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        temperature: 0.85,
        maxOutputTokens: 300,
      },
      contents: history,
    });

    const replyText = response.text;
    history.push({ role: "model", parts: [{ text: replyText }] });
    return replyText;
  } catch (error) {
    console.error(`❌ خطأ في Gemini:`, error.message);
    return "عذراً، حصل خطأ تقني صغير 🙏 جرب مرة ثانية.";
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./session" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("امسح الـ QR Code:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("🚀 البوت جاهز ويعمل!");
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ انقطع الاتصال، جاري إعادة المحاولة...", reason);
  setTimeout(() => client.initialize(), 5000);
});

// 🔴 تحكم بالحالة يدوياً أو برمجياً:
// true = أنت فاتح النت وتتصفح (يرسل "القليل من الوقت..." ثم يكمل جيمني)
// false = أنت مغلق تماماً (يرسل "لا يتوفر حالياً..." فقط)
let isOnline = true; 

client.on("message", async (message) => {
  if (message.fromMe) return;
  if (message.type !== "chat") return;

  const userText = message.body.trim();
  if (!userText) return;

  const senderId = message.from;
  const chat = await message.getChat();

  if (!isOnline) {
    // الحالة الأولى: إذا كنت مغلقاً
    await message.reply("لا يتوفر حالياً، كيف يمكنني مساعدتك؟");
  } else {
    // الحالة الثانية: إذا كنت فاتحاً للنت
    await message.reply("القليل من الوقت وسيجيبك. كيف يمكنني مساعدتك؟ هل لديك سؤال تريد معرفة إجابته؟");
    
    // تفعيل جيمني ليرد بعد الرسالة التمهيدية
    await chat.sendStateTyping();
    const reply = await generateReply(senderId, userText);
    await chat.clearState();
    await message.reply(reply);
  }
});

client.initialize();

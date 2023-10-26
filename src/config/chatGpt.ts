import OpenAI from 'openai';
const {CHATGPT_API_KEY} = require('./secret')

const openai = new OpenAI({
  apiKey: CHATGPT_API_KEY,
});
async function chatGpt(Content: string) {

  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: Content }],
    n: 3
  });
  return chatCompletion.choices[0].message.content;
}

export default chatGpt;
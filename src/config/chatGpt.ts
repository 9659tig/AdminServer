import { z } from 'zod';
import { openAIProvider, OpenAIProvider } from '../agent/providers/llm/OpenAIProvider';
import { ModelPolicyName } from '../agent/providers/llm/modelPolicy';

const productNameSchema = z.object({
  productName: z.string().trim().min(1),
});

interface ChatGptOptions {
  policy?: ModelPolicyName;
}

const PRODUCT_NAME_SYSTEM_PROMPT = [
  'You extract exactly one product name from candidate product titles.',
  'Return JSON only with the shape {"productName":"..."}.',
  'Choose the first strongly supported product if multiple products appear.',
].join(' ');

export function createChatGpt(provider: Pick<OpenAIProvider, 'generateObject'> = openAIProvider) {
  return async (content: string, options: ChatGptOptions = {}) => {
    const response = await provider.generateObject({
      policy: options.policy ?? 'mini-default',
      systemPrompt: PRODUCT_NAME_SYSTEM_PROMPT,
      userPrompt: content,
      schema: productNameSchema,
      temperature: 0.2,
      maxOutputTokens: 120,
    });

    return response.object.productName;
  };
}

const chatGpt = createChatGpt();

export default chatGpt;

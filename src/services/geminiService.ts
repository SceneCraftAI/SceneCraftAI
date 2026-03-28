import { GoogleGenAI, Type } from '@google/genai';
import { Block, CategoryId } from '../types';
import { INFLUENCER_BLOCKS, GENERAL_BLOCKS } from '../constants';

// Initialize the Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ALL_BLOCKS = [...INFLUENCER_BLOCKS, ...GENERAL_BLOCKS];

export interface PromptSegment {
  text: string;
  categoryId: CategoryId | 'custom' | null;
}

/**
 * Generates a cohesive prompt based on the selected blocks and custom text.
 */
export async function generateCohesivePrompt(
  blocks: Block[], 
  customInstructions: string[],
  isNsfwEnabled: boolean,
  isSubstitutionEnabled: boolean,
  bannedWords: string[],
  outputLanguage: 'es' | 'en'
): Promise<PromptSegment[]> {
  const blockDescriptions = blocks.map(b => `[${b.categoryId}]: ${b.value}`).join('\n');
  const customInstructionsText = customInstructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n');
  const bannedWordsText = bannedWords.length > 0 ? bannedWords.join(', ') : 'None';
  
  const substitutionText = isSubstitutionEnabled 
    ? `IMPORTANT: Start the prompt EXACTLY with this text: "${outputLanguage === 'es' ? 'Sustituye a la persona de la @img2 por la persona de la @img1 . Manten los rasgos faciales exactos de la @img1 pero en encuadre y pose de la @img2. En la imagen no debe aparecer texto. ni logos.' : 'Replace the person in @img2 with the person in @img1. Keep the exact facial features of @img1 but in the framing and pose of @img2. No text or logos should appear in the image.'}" Then, add the rest of the prompt. Ignore any blocks that would completely change the main character's identity from img1.`
    : '';

  const nsfwText = isNsfwEnabled 
    ? `NSFW is ENABLED. You have freedom to use explicit words if the blocks require it.`
    : `NSFW is DISABLED. You MUST AVOID explicit words like pezones, senos, boobs, desnuda, sexo, etc. Find safe alternatives if needed.`;

  const prompt = `
You are an expert AI image prompt engineer. Your job is to take a set of structural blocks and turn them into a highly cohesive, professional, and natural-sounding image generation prompt.

Here are the selected blocks:
${blockDescriptions}

${customInstructions.length > 0 ? `Additional user instructions (incorporate these into the prompt):\n${customInstructionsText}` : ''}

${substitutionText}

${nsfwText}

BANNED WORDS (You MUST NOT use these words in the final prompt under any circumstances): ${bannedWordsText}

Instructions:
1. Combine these elements into a single, flowing paragraph.
2. Ensure the narrative makes sense (e.g., if it's a selfie, the camera angle and hand placement should reflect that).
3. Emphasize realism and coherence.
4. If there are negative constraints (category: negative), integrate them naturally into the positive prompt as "avoiding X" or "without X", rather than a separate negative prompt section.
5. HIGHLIGHTING: You must return the prompt as a JSON array of segments. Each segment should have a "text" string and a "categoryId" string.
   - If the text comes from a specific block, use that block's category ID (e.g., "outfit", "scene", "camera").
   - If the text comes from custom instructions, use "custom".
   - If the text is just connecting words (like "A photo of a", "with", "and"), use null for categoryId.
   - Example: [{"text": "A realistic photo of a woman ", "categoryId": null}, {"text": "wearing a black crop top ", "categoryId": "outfit"}, {"text": "in a cozy bedroom.", "categoryId": "scene"}]
6. IMPORTANT: The final prompt text MUST be written in ${outputLanguage === 'es' ? 'Spanish' : 'English'}. Translate any blocks or instructions if necessary to ensure the final output is entirely in ${outputLanguage === 'es' ? 'Spanish' : 'English'}.
7. Do not include any preamble or conversational text. Return ONLY the JSON array.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              categoryId: { type: Type.STRING, nullable: true },
            },
            required: ['text'],
          },
        },
      },
    });
    
    const jsonStr = response.text?.trim();
    if (jsonStr) {
      return JSON.parse(jsonStr) as PromptSegment[];
    }
    return [];
  } catch (error) {
    console.error('Error generating prompt:', error);
    return [{ text: 'Error generating prompt. Please try again.', categoryId: null }];
  }
}

/**
 * Analyzes user chat input and suggests blocks to add or remove.
 */
export async function analyzeChatInput(
  input: string,
  currentBlocks: Block[]
): Promise<{ blocksToAdd: string[]; blocksToRemove: string[] }> {
  const currentBlockIds = currentBlocks.map(b => b.id);
  const availableBlocksJson = ALL_BLOCKS.map(b => ({ id: b.id, label: b.label, category: b.categoryId }));

  const prompt = `
You are an AI assistant for a visual prompt builder app. The user has typed a request to modify their current scene.
Your job is to map their request to the available blocks.

User request: "${input}"

Currently selected block IDs: ${JSON.stringify(currentBlockIds)}

Available blocks:
${JSON.stringify(availableBlocksJson)}

Determine which block IDs should be added and which should be removed to fulfill the user's request.
Return a JSON object with two arrays of strings: "blocksToAdd" and "blocksToRemove".
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blocksToAdd: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Array of block IDs to add',
            },
            blocksToRemove: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Array of block IDs to remove',
            },
          },
          required: ['blocksToAdd', 'blocksToRemove'],
        },
      },
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
  } catch (error) {
    console.error('Error analyzing chat input:', error);
  }

  return { blocksToAdd: [], blocksToRemove: [] };
}

/**
 * Suggests related blocks based on the current selection (Brainstorming).
 */
export async function suggestRelatedBlocks(currentBlocks: Block[]): Promise<string[]> {
  if (currentBlocks.length === 0) return [];

  const currentBlockIds = currentBlocks.map(b => b.id);
  const availableBlocksJson = ALL_BLOCKS.map(b => ({ id: b.id, label: b.label, category: b.categoryId }));

  const prompt = `
You are a creative director assistant. Based on the currently selected blocks for an image prompt, suggest 3 to 5 other available blocks that would perfectly complement the scene.

Currently selected block IDs: ${JSON.stringify(currentBlockIds)}

Available blocks:
${JSON.stringify(availableBlocksJson)}

Return a JSON array of strings containing the IDs of the suggested blocks. Do not suggest blocks that are already selected.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of suggested block IDs',
        },
      },
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed && typeof parsed === 'object') {
        const possibleArray = Object.values(parsed).find(val => Array.isArray(val));
        if (possibleArray) {
          return possibleArray as string[];
        }
      }
    }
  } catch (error) {
    console.error('Error suggesting blocks:', error);
  }

  return [];
}

/**
 * Analyzes an uploaded image and extracts a detailed prompt.
 */
export async function analyzeImageForPrompt(imageBase64: string): Promise<string> {
  try {
    const base64Data = imageBase64.split(',')[1];
    const mimeType = imageBase64.split(';')[0].split(':')[1];

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Analyze this image in detail and extract a descriptive prompt that could be used to generate a similar image. 
            Describe the subject, pose, clothing, environment, lighting, artistic style, and any relevant details.
            Respond ONLY with the extracted prompt in plain text, without introductions or explanations.`,
          },
        ],
      },
    });

    return response.text || "Could not extract prompt from image.";
  } catch (error) {
    console.error("Error analyzing image:", error);
    return "An error occurred while analyzing the image.";
  }
}

/**
 * Enhances a prompt using AI to add more detail and professional quality.
 */
export async function enhancePrompt(prompt: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are an expert in prompt engineering for generative AI images (such as Midjourney, Stable Diffusion, DALL-E 3).
Your task is to take the following base prompt and significantly improve it by adding technical, artistic, lighting, atmosphere, and style details, maintaining the original essence but making it much more professional and detailed.

Base Prompt: "${prompt}"

Return ONLY the improved prompt in English, without explanations or introductions.`,
    });
    return response.text || prompt;
  } catch (error) {
    console.error("Error enhancing prompt:", error);
    return prompt;
  }
}

/**
 * Adapts a prompt to a specific target model.
 */
export async function adaptPromptToModel(prompt: string, model: string): Promise<string> {
  if (model === 'scenecraft') return prompt;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Adapt the following prompt to work optimally in the image generation model: "${model}".
Make sure to use the syntax, tokens, and style that best suits that specific model (for example, Midjourney uses parameters like --ar, Stable Diffusion uses weights like (keyword:1.2), etc.).

Original Prompt: "${prompt}"

Return ONLY the adapted prompt, without explanations.`,
    });
    return response.text || prompt;
  } catch (error) {
    console.error("Error adapting prompt:", error);
    return prompt;
  }
}

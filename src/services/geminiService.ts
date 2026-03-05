import { GoogleGenAI, Type } from "@google/genai";
import { FoodItem, MealPlan, UserProfile } from "../types";

const getApiKey = () => {
  // Try Vite env first (Vercel/Production)
  const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (viteKey) return viteKey;
  
  // Fallback to process.env (AI Studio Preview)
  try {
    return process.env.GEMINI_API_KEY;
  } catch {
    return undefined;
  }
};

const apiKey = getApiKey();
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const scanPlate = async (base64Image: string, mimeType: string = "image/jpeg"): Promise<FoodItem[]> => {
  if (!apiKey) {
    console.error("Gemini API Key not configured");
    return [];
  }
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
        {
          text: "Identify the food items in this plate. For each item, estimate the portion size, calories, protein, carbs, and fats. Return the result as a JSON array of objects with keys: name, calories, protein, carbs, fats, portion.",
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fats: { type: Type.NUMBER },
            portion: { type: Type.STRING },
          },
          required: ["name", "calories", "protein", "carbs", "fats", "portion"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
};

export const generateMealPlan = async (profile: UserProfile, stats: any): Promise<string> => {
  if (!apiKey) return "Configuração da IA pendente.";
  const prompt = `
    Based on the following user profile:
    - Weight: ${profile.weight}kg
    - Height: ${profile.height}cm
    - Age: ${profile.age}
    - Goal: ${profile.goal}
    - Restrictions/Allergies: ${profile.restrictions || 'None'}
    - Daily Calorie Target: ${Math.round(stats.tdee)} kcal
    - Macro Targets: Protein ${stats.macros.protein}g, Carbs ${stats.macros.carbs}g, Fats ${stats.macros.fats}g

    Generate a daily meal plan (Breakfast, Lunch, Dinner, and Snacks) that fits these targets. 
    Provide the suggestions in Portuguese. Use Markdown formatting.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text || "Não foi possível gerar o cardápio.";
};

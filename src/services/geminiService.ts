import { GoogleGenAI, Type } from "@google/genai";
import { FoodItem, MealPlan, UserProfile, WorkoutInfo } from "../types";

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

export const getWorkoutInfo = async (workoutName: string, limitations: string = ""): Promise<WorkoutInfo | null> => {
  if (!apiKey) return null;

  const prompt = `
    Você é o núcleo de inteligência do app Kross Zone, um sistema de treinamento funcional inspirado no modelo F45.
    Identifique o treino solicitado: "${workoutName}".
    
    Considere estas limitações do aluno: "${limitations}".

    Forneça:
    1. Resumo motivador em Português do Brasil.
    2. Foco do treino (Cardio, Força ou Híbrido).
    3. Estrutura (Estações, Pods, Laps e Tempo).
    4. Lista de 6 exercícios principais. Para cada um, forneça o nome original e uma substituição (Smart Swap) baseada nas limitações (se houver) ou uma alternativa comum de baixo impacto.
    5. Um link fictício de vídeo formatado como: https://kross.zone/video/[nome-do-treino]

    Retorne APENAS um objeto JSON com esta estrutura:
    {
      "name": "Nome do Treino",
      "type": "Cardio | Força | Híbrido",
      "summary": "Texto motivador...",
      "structure": {
        "stations": 12,
        "pods": 1,
        "laps": 2,
        "timing": "45s on / 15s off"
      },
      "exercises": [
        { "name": "Nome", "original": "Exercício Original", "swap": "Substituição", "reason": "Por que trocar" }
      ],
      "videoUrl": "https://..."
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["Cardio", "Força", "Híbrido"] },
          summary: { type: Type.STRING },
          structure: {
            type: Type.OBJECT,
            properties: {
              stations: { type: Type.NUMBER },
              pods: { type: Type.NUMBER },
              laps: { type: Type.NUMBER },
              timing: { type: Type.STRING }
            },
            required: ["stations", "pods", "laps", "timing"]
          },
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                original: { type: Type.STRING },
                swap: { type: Type.STRING },
                reason: { type: Type.STRING }
              },
              required: ["name", "original", "swap", "reason"]
            }
          },
          videoUrl: { type: Type.STRING }
        },
        required: ["name", "type", "summary", "structure", "exercises", "videoUrl"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "null");
  } catch (e) {
    console.error("Failed to parse workout info", e);
    return null;
  }
};

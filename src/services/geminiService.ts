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
let detectedModel = "gemini-1.5-flash"; // Default fallback

// Auto-discovery of the best available model
const discoverModel = async () => {
  if (!apiKey) return detectedModel;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models && data.models.length > 0) {
      // Find a model that supports generateContent and is "flash" if possible
      // PRIORITIZE 1.5 stable over 2.5 experimental to avoid 503 errors
      const flashModels = data.models.filter((m: any) =>
        m.supportedGenerationMethods.includes("generateContent") &&
        m.name.includes("flash")
      );

      const stableModel = flashModels.find((m: any) => m.name.includes("gemini-1.5-flash"));
      const bestModel = stableModel || flashModels[0];

      if (bestModel) {
        detectedModel = bestModel.name.split('/').pop() || detectedModel;
        console.log("Auto-detected best model:", detectedModel);
      }
    }
  } catch (e) {
    console.error("Discovery failed, using default:", e);
  }
  return detectedModel;
};

if (apiKey) {
  console.log("Gemini API Key loaded (starts with):", apiKey.substring(0, 6) + "...");
  discoverModel(); // Init discovery
} else {
  console.error("Gemini API Key NOT found!");
}

export const scanPlate = async (base64Image: string, mimeType: string = "image/jpeg"): Promise<FoodItem[]> => {
  if (!apiKey) {
    console.error("Gemini API Key not configured");
    return [];
  }

  try {
    const modelToUse = await discoverModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

    console.log("Calling Gemini:", url.split('?')[0]); // Safe log

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image,
                },
              },
              {
                text: "Identify the food items in this plate. For each item, estimate the portion size (e.g., '100g', '1 unit'), calories, protein (g), carbs (g), and fats (g). Return the result as a JSON array of objects with keys: name, calories, protein, carbs, fats, portion. FORMAT THE RESPONSE AS A PURE JSON ARRAY WITHOUT MARKDOWN BACKTICKS.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.error?.message || errorText;
      } catch { }

      if (response.status === 503) {
        throw new Error("O Google está com muita demanda no momento (Erro 503). Por favor, espere 10 segundos e tente de novo.");
      }
      throw new Error(`[${response.status}] ${errorMsg}`);
    }

    const data = await response.json();
    console.log("Gemini API Full Response:", data);

    if (data.error) {
      throw new Error(`Erro da API: ${data.error.message}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("O conteúdo foi bloqueado pelos filtros de segurança da IA.");
      }
      throw new Error("A IA retornou uma resposta vazia.");
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Erro ao processar JSON da IA:", text);
      throw new Error("A resposta da IA não está em um formato válido.");
    }
  } catch (e: any) {
    console.error("Failed to scan plate with Gemini", e);
    throw e; // Re-throw to be caught by App.tsx
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

  try {
    const modelToUse = await discoverModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error (Meal Plan):", errorText);
      return "Erro ao comunicar com a IA.";
    }

    const data = await response.json();
    console.log("Gemini Meal Plan Data:", data);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Não foi possível gerar o cardápio.";
  } catch (e) {
    console.error("Fetch error:", e);
    return "Erro de conexão com a IA.";
  }
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
    5. Um link de vídeo de busca no YouTube formatado como: https://www.youtube.com/results?search_query=F45+[nome-do-treino]+workout. 
       IMPORTANTE: Se o treino for "miami nights", o link DEVE ser exatamente: https://www.youtube.com/watch?v=LfvPL1DLmek&t=232s
  `;

  try {
    const modelToUse = await discoverModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              type: { type: "STRING" },
              summary: { type: "STRING" },
              structure: {
                type: "OBJECT",
                properties: {
                  stations: { type: "NUMBER" },
                  pods: { type: "NUMBER" },
                  laps: { type: "NUMBER" },
                  timing: { type: "STRING" }
                },
                required: ["stations", "pods", "laps", "timing"]
              },
              exercises: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    original: { type: "STRING" },
                    swap: { type: "STRING" },
                    reason: { type: "STRING" }
                  },
                  required: ["name", "original", "swap", "reason"]
                }
              },
              videoUrl: { type: "STRING" }
            },
            required: ["name", "type", "summary", "structure", "exercises", "videoUrl"]
          }
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error:", errorText);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return null;
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse workout info", e);
    return null;
  }
};

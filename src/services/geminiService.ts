import { GoogleGenAI, Type } from "@google/genai";

export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface Meal {
  id: string;
  name: string;
  type: 'Desayuno' | 'Almuerzo' | 'Merienda' | 'Cena';
  ingredients: Ingredient[];
  recipe?: string;
  calories?: number;
  macros?: {
    protein?: string;
    carbs?: string;
    fat?: string;
  };
  is_favorite?: boolean;
}

export interface DayPlan {
  day: string;
  meals: Meal[];
}

export interface UserPreferences {
  peopleCount: number;
  restrictions: string[];
  calorieLimit?: number;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const geminiService = {
  async generateWeeklyPlan(preferences: UserPreferences, knownRecipes: Meal[]): Promise<DayPlan[]> {
    const knownRecipesSummary = knownRecipes.map(r => `- ${r.name} (${r.type})`).join('\n');
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera un plan de alimentación semanal (7 días) para ${preferences.peopleCount} personas en Argentina. 
      Usa terminología local argentina.
      
      RESTRICCIONES CRÍTICAS: ${preferences.restrictions.join(', ') || 'Ninguna'}. 
      Es OBLIGATORIO respetar estas restricciones.
      
      RECETAS CONOCIDAS (Reutiliza estas si encajan con las restricciones para ahorrar tokens):
      ${knownRecipesSummary || 'Ninguna todavía.'}
      
      OBJETIVO NUTRICIONAL: El total diario de calorías por persona debe ser de aproximadamente ${preferences.calorieLimit && preferences.calorieLimit > 0 ? `${preferences.calorieLimit} kcal` : 'sin límite específico'} (distribuidas en las 4 comidas).
      
      Para cada día, incluye: Desayuno, Almuerzo, Merienda y Cena. 
      
      CANTIDADES Y UNIDADES: Asegúrate de que las cantidades sean para UNA (1) PERSONA (Base). 
      Usa unidades estándar (g, kg, ml, l, unidades, tazas, cucharadas).
      
      NORMALIZACIÓN DE INGREDIENTES (CRÍTICO):
      1. NO uses ingredientes compuestos (ej: "Aceite y vinagre"). Sepáralos en dos ingredientes distintos.
      2. Usa nombres de ingredientes BASE y SIMPLES (ej: usa "Papa" en lugar de "Papas bastón" o "Papas noisette").
      3. Sé CONSISTENTE con las unidades para un mismo ingrediente (ej: si usas "Banana" en gramos en una receta, intenta usar gramos en otras, o siempre unidades si es más común).
      4. Evita adjetivos innecesarios en el nombre del ingrediente (ej: "Cebolla picada" -> nombre: "Cebolla", la preparación va en la receta).
      
      CONSISTENCIA DE NOMBRES: Usa nombres SIMPLES y CONSISTENTES.
      
      Devuelve un JSON con una lista de días, cada uno con su nombre y una lista de comidas. 
      Si usas una RECETA CONOCIDA, mantén su nombre exacto. 
      Si creas una NUEVA, asígnale un ID único, detalla sus ingredientes (siempre para 1 persona), estima las CALORÍAS por persona y los MACRONUTRIENTES (proteínas, carbohidratos, grasas).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.STRING },
              meals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
                    calories: { type: Type.INTEGER, description: "Calorías estimadas por persona" },
                    macros: {
                      type: Type.OBJECT,
                      properties: {
                        protein: { type: Type.STRING, description: "Proteínas estimadas (ej: 20g)" },
                        carbs: { type: Type.STRING, description: "Carbohidratos estimados (ej: 40g)" },
                        fat: { type: Type.STRING, description: "Grasas estimadas (ej: 10g)" }
                      }
                    },
                    ingredients: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          amount: { type: Type.STRING },
                          unit: { type: Type.STRING }
                        },
                        required: ["name", "amount", "unit"]
                      }
                    }
                  },
                  required: ["id", "name", "type", "ingredients"]
                }
              }
            },
            required: ["day", "meals"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  },

  async searchMealDetails(mealName: string): Promise<Meal> {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera los detalles de la comida "${mealName}" para Argentina. 
      Usa terminología local argentina.
      Devuelve un JSON con id, name, type (Desayuno, Almuerzo, Merienda o Cena), calorías (estimadas por persona), macronutrientes (proteínas, carbohidratos, grasas) e ingredientes (lista de objetos con name, amount, unit).
      
      NORMALIZACIÓN DE INGREDIENTES:
      1. NO uses ingredientes compuestos (ej: "Sal y pimienta"). Sepáralos.
      2. Usa nombres BASE (ej: "Papa" en lugar de "Papas fritas").
      3. Evita adjetivos en el nombre (ej: "Tomate cortado" -> "Tomate").
      
      IMPORTANTE: Las cantidades de los ingredientes deben ser para UNA (1) PERSONA.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            type: { type: Type.STRING },
            calories: { type: Type.INTEGER },
            macros: {
              type: Type.OBJECT,
              properties: {
                protein: { type: Type.STRING },
                carbs: { type: Type.STRING },
                fat: { type: Type.STRING }
              }
            },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.STRING },
                  unit: { type: Type.STRING }
                },
                required: ["name", "amount", "unit"]
              }
            }
          },
          required: ["id", "name", "type", "ingredients"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  },

  async getRecipe(mealName: string): Promise<string> {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Proporciona la receta detallada para "${mealName}" en Argentina. 
      Usa terminología local argentina.
      Describe los pasos de preparación paso a paso de forma clara. 
      No te preocupes por las cantidades exactas en el texto de la preparación, ya que se mostrarán por separado.
      Usa formato Markdown.`,
    });
    return response.text || "No se pudo generar la receta.";
  },

  async getEstimatedPrices(ingredients: { name: string, amount: string, unit: string }[]): Promise<{ prices: Record<string, string>, sources: { uri: string, title: string }[] }> {
    if (ingredients.length === 0) return { prices: {}, sources: [] };
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Busca los precios estimativos actuales en pesos argentinos (ARS) para los siguientes ingredientes en supermercados de Argentina (como Coto, Carrefour, o Jumbo). 
      Calcula el precio TOTAL para la cantidad solicitada de cada ingrediente.
      
      Ingredientes:
      ${ingredients.map(i => `- ${i.name}: ${i.amount} ${i.unit}`).join('\n')}
      
      Responde ÚNICAMENTE con un objeto JSON donde las llaves sean los nombres de los ingredientes (exactamente como están en la lista) y los valores sean el precio estimado total (ej: "$1500").`,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    
    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map(chunk => chunk.web)
      .filter(web => web && web.uri && web.title) as { uri: string, title: string }[] || [];

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const prices = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return { prices, sources };
    } catch (e) {
      console.error("Error parsing prices JSON:", e, "Raw text:", text);
      return { prices: {}, sources };
    }
  },

  async swapMeal(mealType: string, preferences: UserPreferences, currentMeals: string[]): Promise<Meal> {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Sugiere una alternativa para un ${mealType} para ${preferences.peopleCount} personas en Argentina. 
      Usa terminología local argentina.
      
      RESTRICCIONES CRÍTICAS: ${preferences.restrictions.join(', ') || 'Ninguna'}. 
      Es OBLIGATORIO respetar estas restricciones.
      
      NORMALIZACIÓN DE INGREDIENTES:
      1. NO uses ingredientes compuestos.
      2. Usa nombres BASE (ej: "Papa").
      3. Evita adjetivos en el nombre.
      
      CANTIDADES Y UNIDADES: Cantidades REALISTAS para ${preferences.peopleCount} personas.
      
      Evita estas comidas que ya están en el plan: ${currentMeals.join(', ')}.
      Devuelve un JSON con la nueva comida (id, name, type, ingredients).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            type: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.STRING },
                  unit: { type: Type.STRING }
                },
                required: ["name", "amount", "unit"]
              }
            }
          },
          required: ["id", "name", "type", "ingredients"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  }
};

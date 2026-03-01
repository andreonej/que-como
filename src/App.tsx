/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Utensils, 
  Users, 
  Plus, 
  X, 
  RefreshCw, 
  ChefHat, 
  ShoppingCart, 
  Calendar,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Heart,
  BookOpen,
  Search,
  Activity
} from 'lucide-react';
import { geminiService, DayPlan, Meal, UserPreferences, Ingredient } from './services/geminiService';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [preferences, setPreferences] = useState<UserPreferences>({
    peopleCount: 2,
    restrictions: []
  });
  const [newRestriction, setNewRestriction] = useState('');
  const [plan, setPlan] = useState<DayPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [favorites, setFavorites] = useState<Meal[]>([]);
  const [allRecipes, setAllRecipes] = useState<Meal[]>([]);
  const [view, setView] = useState<'plan' | 'favorites' | 'library'>('plan');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceSources, setPriceSources] = useState<{ uri: string, title: string }[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMealQuery, setNewMealQuery] = useState('');
  const [searchingMeal, setSearchingMeal] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'comida' | 'colacion'>('all');
  const [nutritionTip, setNutritionTip] = useState('');

  const tips = [
    "Priorizá el consumo de agua: 2 litros por día es el ideal para mantenerte hidratado.",
    "Intentá que la mitad de tu plato en almuerzo y cena sean verduras de estación.",
    "Las legumbres son una excelente fuente de proteína vegetal y fibra. ¡Sumalas a tus ensaladas!",
    "Evitá el exceso de sal. Usá especias como orégano, pimentón o comino para dar sabor.",
    "El desayuno es clave, pero no obligatorio. Escuchá a tu cuerpo y desayuná si tenés hambre real.",
    "Frutos secos: un puñado al día aporta grasas saludables y saciedad.",
    "Cociná de más y freezá: tener comida casera lista evita que pidas delivery poco saludable."
  ];

  useEffect(() => {
    setNutritionTip(tips[Math.floor(Math.random() * tips.length)]);
  }, [plan]);

  useEffect(() => {
    // Load preferences, favorites and all recipes on mount
    const init = async () => {
      setLoading(true);
      try {
        // Fetch preferences
        const prefRes = await fetch('/api/preferences');
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          setPreferences({
            peopleCount: prefData.people_count || 2,
            restrictions: typeof prefData.restrictions === 'string' ? JSON.parse(prefData.restrictions) : (prefData.restrictions || []),
            calorieLimit: prefData.calorie_limit || 2000
          });
        }

        // Fetch favorites
        const favRes = await fetch('/api/favorites');
        if (favRes.ok) {
          const favData = await favRes.json();
          setFavorites(Array.isArray(favData) ? favData : []);
        }

        // Fetch all recipes
        let currentRecipes: Meal[] = [];
        const allRes = await fetch('/api/recipes');
        if (allRes.ok) {
          const allData = await allRes.json();
          currentRecipes = Array.isArray(allData) ? allData : [];
          setAllRecipes(currentRecipes);
        }

        // Fetch current plan
        const planRes = await fetch('/api/plan');
        if (planRes.ok) {
          const planData = await planRes.json();
          if (Array.isArray(planData) && planData.length > 0) {
            // Sync plan with current recipes to get updated favorite status and macros
            const syncedPlan = planData.map((day: any) => ({
              ...day,
              meals: day.meals.map((meal: Meal) => {
                // Try to find the latest version of this recipe in our library
                const latest = currentRecipes.find((r: Meal) => r.name.toLowerCase() === meal.name.toLowerCase());
                return latest ? { ...meal, id: latest.id, is_favorite: latest.is_favorite, macros: latest.macros || meal.macros } : meal;
              })
            }));
            setPlan(syncedPlan);
            setView('plan');
            // Persist the synced plan back to the DB to keep it consistent
            await savePlan(syncedPlan);
          }
        }
      } catch (error) {
        console.error("Error initializing:", error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const savePreferences = async (newPrefs: UserPreferences) => {
    try {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people_count: newPrefs.peopleCount,
          restrictions: newPrefs.restrictions,
          calorie_limit: newPrefs.calorieLimit
        })
      });
    } catch (error) {
      console.error("Error saving preferences:", error);
    }
  };

  const savePlan = async (newPlan: DayPlan[]) => {
    try {
      await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: newPlan })
      });
    } catch (error) {
      console.error("Error saving plan:", error);
    }
  };

  const generateLocalPlan = async () => {
    if (allRecipes.length < 1) return;
    
    setLoading(true);
    // Artificial delay for "calculating" feel but much faster than AI
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const types: ('Desayuno' | 'Almuerzo' | 'Merienda' | 'Cena')[] = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];
      
      const filteredRecipes = allRecipes.filter(r => {
        const ingredientsText = r.ingredients.map(i => i.name.toLowerCase()).join(' ');
        return !preferences.restrictions.some(res => ingredientsText.includes(res.toLowerCase()));
      });

      const newPlan: DayPlan[] = days.map(day => {
        const meals: Meal[] = types.map(type => {
          const typeRecipes = filteredRecipes.filter(r => r.type === type);
          const favorites = typeRecipes.filter(r => r.is_favorite);
          
          // Prioritize favorites that meet restrictions, then any that meet restrictions, then any of that type
          let pool = favorites.length > 0 ? favorites : typeRecipes;
          if (pool.length === 0) {
            pool = allRecipes.filter(r => r.type === type);
          }
          
          if (pool.length === 0) {
            // Fallback if no recipes of this type exist at all
            return {
              id: Math.random().toString(36).substr(2, 9),
              name: `Pendiente (${type})`,
              type,
              ingredients: [],
              calories: 0
            };
          }
          
          return pool[Math.floor(Math.random() * pool.length)];
        });
        return { day, meals };
      });

      setPlan(newPlan);
      setActiveDayIndex(0);
      setView('plan');
      await savePreferences(preferences);
      await savePlan(newPlan);
    } catch (error) {
      console.error("Error generating local plan:", error);
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    setLoading(true);
    try {
      const newPlan = await geminiService.generateWeeklyPlan(preferences, allRecipes);
      
      // Sync IDs with existing recipes to avoid duplicates and fix favorite toggling
      const syncedPlan = newPlan.map(day => ({
        ...day,
        meals: day.meals.map(meal => {
          const existing = allRecipes.find(r => r.name.toLowerCase() === meal.name.toLowerCase());
          return existing ? { ...meal, id: existing.id, is_favorite: existing.is_favorite } : meal;
        })
      }));

      setPlan(syncedPlan);
      setActiveDayIndex(0);
      setView('plan');
      await savePreferences(preferences);
      await savePlan(syncedPlan);

      // Save any new recipes to the DB
      const newRecipes = syncedPlan.flatMap(d => d.meals).filter(m => 
        !allRecipes.some(r => r.name.toLowerCase() === m.name.toLowerCase())
      );
      for (const meal of newRecipes) {
        await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...meal, is_favorite: false })
        });
      }
      
      // Refresh all recipes
      const allRes = await fetch('/api/recipes');
      const allData = await allRes.json();
      setAllRecipes(allData);
    } catch (error) {
      console.error("Error generating plan:", error);
    } finally {
      setLoading(false);
    }
  };

  const swapMeal = async (dayIndex: number, mealIndex: number) => {
    const meal = plan[dayIndex].meals[mealIndex];
    const currentMealNames = plan.flatMap(d => d.meals.map(m => m.name));
    
    setLoading(true);
    try {
      const newMealRaw = await geminiService.swapMeal(meal.type, preferences, currentMealNames);
      const existing = allRecipes.find(r => r.name.toLowerCase() === newMealRaw.name.toLowerCase());
      const newMeal = existing ? { ...newMealRaw, id: existing.id, is_favorite: existing.is_favorite } : newMealRaw;
      
      const newPlan = [...plan];
      newPlan[dayIndex].meals[mealIndex] = newMeal;
      setPlan(newPlan);
      await savePlan(newPlan);

      // If it's a new recipe, save it
      if (!existing) {
        await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newMeal, is_favorite: false })
        });
        // Refresh all recipes
        const allRes = await fetch('/api/recipes');
        const allData = await allRes.json();
        setAllRecipes(allData);
      }
    } catch (error) {
      console.error("Error swapping meal:", error);
    } finally {
      setLoading(false);
    }
  };

  const viewRecipe = async (meal: Meal) => {
    // Check if we have it in favorites or library first
    const existing = allRecipes.find(r => r.id === meal.id || r.name.toLowerCase() === meal.name.toLowerCase());
    if (existing?.recipe) {
      setSelectedMeal(existing);
      return;
    }

    if (meal.recipe) {
      setSelectedMeal(meal);
      return;
    }

    setLoading(true);
    try {
      const recipe = await geminiService.getRecipe(meal.name);
      const updatedMeal = { ...meal, recipe };
      
      // Update plan if it exists there
      const newPlan = plan.map(day => ({
        ...day,
        meals: day.meals.map(m => m.id === meal.id ? updatedMeal : m)
      }));
      setPlan(newPlan);
      setSelectedMeal(updatedMeal);

      // Save to DB (library)
      await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedMeal, is_favorite: favorites.some(f => f.id === meal.id) })
      });

      // Update local states
      setAllRecipes(prev => prev.map(r => r.id === meal.id ? updatedMeal : r));
      if (favorites.some(f => f.id === meal.id)) {
        setFavorites(prev => prev.map(f => f.id === meal.id ? updatedMeal : f));
      }
    } catch (error) {
      console.error("Error fetching recipe:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (meal: Meal) => {
    const isFav = favorites.some(f => f.id === meal.id);
    const updatedMeal = { ...meal, is_favorite: !isFav };

    try {
      await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMeal)
      });

      if (isFav) {
        setFavorites(prev => prev.filter(f => f.id !== meal.id));
      } else {
        setFavorites(prev => [...prev, updatedMeal]);
      }
      
      // Update allRecipes as well
      setAllRecipes(prev => prev.map(r => r.id === meal.id ? updatedMeal : r));

      // Update plan if it contains this meal
      const newPlan = plan.map(day => ({
        ...day,
        meals: day.meals.map(m => m.id === meal.id ? updatedMeal : m)
      }));
      setPlan(newPlan);
      await savePlan(newPlan);
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const deleteRecipe = async (id: string) => {
    if (!confirm('¿Estás seguro de que querés eliminar esta receta de la biblioteca?')) return;

    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAllRecipes(prev => prev.filter(r => r.id !== id));
        setFavorites(prev => prev.filter(f => f.id !== id));
        
        // Update plan if it contains this meal
        const newPlan = plan.map(day => ({
          ...day,
          meals: day.meals.map(m => m.id === id ? { ...m, is_favorite: false } : m)
        }));
        setPlan(newPlan);
        await savePlan(newPlan);
      }
    } catch (error) {
      console.error("Error deleting recipe:", error);
    }
  };

  const shoppingList = useMemo(() => {
    const list: Record<string, Record<string, number>> = {};
    
    // Helper to normalize units and convert to base units
    const getBaseUnitInfo = (u: string, amt: number) => {
      const unit = u.toLowerCase().trim();
      if (['kg', 'kilo', 'kilogramo', 'kilogramos'].includes(unit)) return { baseUnit: 'g', baseAmount: amt * 1000 };
      if (['g', 'gr', 'gramo', 'gramos'].includes(unit)) return { baseUnit: 'g', baseAmount: amt };
      if (['ml', 'mililitro', 'mililitros'].includes(unit)) return { baseUnit: 'ml', baseAmount: amt };
      if (['l', 'litro', 'litros'].includes(unit)) return { baseUnit: 'ml', baseAmount: amt * 1000 };
      if (['un', 'unidad', 'unidades', 'u', 'paquete', 'paquetes'].includes(unit)) return { baseUnit: 'un', baseAmount: amt };
      return { baseUnit: unit, baseAmount: amt };
    };

    // Improved normalization for Spanish ingredient names
    const normalizeName = (n: string) => {
      let name = n.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9 ]/g, ' ') // Quitar caracteres especiales, reemplazando por espacio
        .replace(/\s+/g, ' ') // Colapsar espacios
        .trim();
      
      // Quitar adjetivos comunes y palabras de preparación que causan duplicados
      const noiseWords = [
        'fresca', 'fresco', 'grande', 'grandes', 'pequeno', 'pequenos', 'mediano', 'medianos', 
        'blanca', 'blancas', 'roja', 'rojas', 'verde', 'verdes', 'picada', 'picado', 'limpio', 
        'limpia', 'frescas', 'frescos', 'baston', 'bastones', 'noisette', 'fritas', 'fritos',
        'cocido', 'cocida', 'rallado', 'rallada', 'en cubos', 'cubitos', 'rodajas', 'fetas',
        'descremado', 'descremada', 'entero', 'entera', 'natural', 'extra virgen', 'comun'
      ];
      
      const regex = new RegExp(`\\b(${noiseWords.join('|')})\\b`, 'g');
      name = name.replace(regex, '').replace(/\s+/g, ' ').trim();
      
      // Plural a singular básico (muy simplificado para español)
      if (name.endsWith('s') && name.length > 3) {
        if (name.endsWith('es')) {
          const base = name.slice(0, -2);
          // Palabras que terminan en consonante suelen agregar 'es'
          if (['l', 'n', 'r', 'd', 'z', 'j', 's'].includes(base.slice(-1))) {
            if (base.endsWith('ce')) return base.slice(0, -1) + 'z'; // peces -> pez
            return base;
          }
        }
        return name.slice(0, -1);
      }
      return name;
    };

    plan.forEach(day => {
      day.meals.forEach(meal => {
        meal.ingredients.forEach(ing => {
          const name = normalizeName(ing.name);
          const baseAmount = parseFloat(ing.amount.replace(',', '.')) || 0;
          // Scale by people count since ingredients are stored for 1 person
          const totalAmount = baseAmount * preferences.peopleCount;
          const { baseUnit, baseAmount: normalizedAmount } = getBaseUnitInfo(ing.unit, totalAmount);
          
          if (!list[name]) list[name] = {};
          if (!list[name][baseUnit]) list[name][baseUnit] = 0;
          list[name][baseUnit] += normalizedAmount;
        });
      });
    });

    const result: { name: string, amount: string, unit: string }[] = [];
    Object.entries(list).forEach(([name, units]) => {
      const unitEntries = Object.entries(units);
      
      if (unitEntries.length === 1) {
        const [unit, amount] = unitEntries[0];
        let finalAmount = amount;
        let finalUnit = unit;
        
        if (unit === 'g' && amount >= 1000) {
          finalAmount = amount / 1000;
          finalUnit = 'kg';
        } else if (unit === 'ml' && amount >= 1000) {
          finalAmount = amount / 1000;
          finalUnit = 'l';
        }

        result.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          amount: finalAmount % 1 === 0 ? finalAmount.toString() : finalAmount.toFixed(2),
          unit: finalUnit
        });
      } else {
        const summary = unitEntries.map(([unit, amount]) => {
          let fAmount = amount;
          let fUnit = unit;
          if (unit === 'g' && amount >= 1000) {
            fAmount = amount / 1000;
            fUnit = 'kg';
          } else if (unit === 'ml' && amount >= 1000) {
            fAmount = amount / 1000;
            fUnit = 'l';
          }
          const displayAmount = fAmount % 1 === 0 ? fAmount.toString() : fAmount.toFixed(2);
          return `${displayAmount} ${fUnit}`;
        }).join(' + ');

        result.push({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          amount: summary,
          unit: ''
        });
      }
    });

    // Ordenar alfabéticamente
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [plan]);

  const fetchPrices = async () => {
    setLoadingPrices(true);
    setPriceError(null);
    try {
      const { prices: estimatedPrices, sources } = await geminiService.getEstimatedPrices(shoppingList);
      if (Object.keys(estimatedPrices).length === 0) {
        setPriceError("No se pudieron encontrar precios en este momento. Intentá de nuevo más tarde.");
      } else {
        setPrices(estimatedPrices);
        setPriceSources(sources);
      }
    } catch (error) {
      console.error("Error fetching prices:", error);
      setPriceError("Ocurrió un error al buscar los precios. Por favor, reintentá.");
    } finally {
      setLoadingPrices(false);
    }
  };

  const addRestriction = (e: React.FormEvent) => {
    e.preventDefault();
    if (newRestriction.trim() && !preferences.restrictions.includes(newRestriction.trim())) {
      setPreferences({
        ...preferences,
        restrictions: [...preferences.restrictions, newRestriction.trim()]
      });
      setNewRestriction('');
    }
  };

  const searchAndAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = newMealQuery.trim();
    if (!query) return;

    // Check if already exists in library
    const existing = allRecipes.find(r => r.name.toLowerCase() === query.toLowerCase());
    if (existing) {
      setSearchQuery(query);
      setNewMealQuery('');
      return;
    }

    setSearchingMeal(true);
    try {
      const meal = await geminiService.searchMealDetails(query);
      
      // Save to DB
      await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...meal, is_favorite: false })
      });

      // Update local state
      setAllRecipes(prev => {
        const exists = prev.some(r => r.name.toLowerCase() === meal.name.toLowerCase());
        if (exists) return prev;
        return [...prev, meal];
      });
      setNewMealQuery('');
      setSearchQuery(''); // Clear search to show the new meal
    } catch (error) {
      console.error("Error searching/adding meal:", error);
    } finally {
      setSearchingMeal(false);
    }
  };

  const removeRestriction = (res: string) => {
    setPreferences({
      ...preferences,
      restrictions: preferences.restrictions.filter(r => r !== res)
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
              <Utensils size={20} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">¿Qué Como?</h1>
          </div>
          <div className="flex items-center gap-4">
            {plan.length > 0 && (
              <div className="flex items-center bg-[#5A5A40]/5 rounded-full p-1">
                <button 
                  onClick={() => setView('plan')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                    view === 'plan' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                  )}
                >
                  Plan
                </button>
                <button 
                  onClick={() => setView('favorites')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                    view === 'favorites' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                  )}
                >
                  Favoritos
                </button>
                <button 
                  onClick={() => setView('library')}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                    view === 'library' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                  )}
                >
                  Biblioteca
                </button>
              </div>
            )}
            {plan.length > 0 && (
              <button 
                onClick={() => setShowShoppingList(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#5A5A40] text-white rounded-full text-sm font-medium hover:bg-[#4a4a35] transition-colors"
              >
                <ShoppingCart size={16} />
                Lista de Compras
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {plan.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl mx-auto bg-white rounded-[32px] p-8 shadow-sm border border-black/5"
          >
            <h2 className="text-3xl font-serif italic mb-2 text-center">¡Hola! 🇦🇷</h2>
            <p className="text-center text-black/40 mb-8">Configurá tu plan semanal con ingredientes locales.</p>
            
            <div className="space-y-8">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-black/50 mb-4">
                  <Users size={16} />
                  Cantidad de personas
                </label>
                <div className="flex items-center gap-4">
                  {[1, 2, 3, 4, 5, 6].map(num => (
                    <button
                      key={num}
                      onClick={() => setPreferences({ ...preferences, peopleCount: num })}
                      className={cn(
                        "w-12 h-12 rounded-full border transition-all flex items-center justify-center font-medium",
                        preferences.peopleCount === num 
                          ? "bg-[#5A5A40] text-white border-[#5A5A40]" 
                          : "bg-white text-black/60 border-black/10 hover:border-black/30"
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-black/50 mb-4">
                  <Activity size={16} />
                  Límite de calorías diario (por persona)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="4000"
                    step="100"
                    value={preferences.calorieLimit || 0}
                    onChange={(e) => setPreferences({ ...preferences, calorieLimit: parseInt(e.target.value) })}
                    className="flex-1 accent-[#5A5A40]"
                  />
                  <div className="w-24 text-center px-3 py-2 bg-[#f5f5f0] rounded-xl font-medium text-[#5A5A40]">
                    {preferences.calorieLimit && preferences.calorieLimit > 0 ? `${preferences.calorieLimit} kcal` : 'Infinito'}
                  </div>
                </div>
                <p className="text-[10px] text-black/30 mt-2 italic">Deslizá a 0 para quitar el límite.</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-black/50 mb-4">
                  <X size={16} />
                  Restricciones alimenticias
                </label>
                <form onSubmit={addRestriction} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newRestriction}
                    onChange={(e) => setNewRestriction(e.target.value)}
                    placeholder="Ej: Vegano, Sin gluten..."
                    className="flex-1 px-4 py-3 rounded-2xl bg-[#f5f5f0] border-none focus:ring-2 focus:ring-[#5A5A40] outline-none transition-all"
                  />
                  <button 
                    type="submit"
                    className="w-12 h-12 bg-[#5A5A40] text-white rounded-2xl flex items-center justify-center hover:bg-[#4a4a35] transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {preferences.restrictions.map(res => (
                    <span 
                      key={res}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#5A5A40]/10 text-[#5A5A40] rounded-full text-sm font-medium"
                    >
                      {res}
                      <button onClick={() => removeRestriction(res)} className="hover:text-red-500">
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={generateLocalPlan}
                  disabled={loading || allRecipes.length < 1}
                  className="py-4 bg-white text-[#5A5A40] border-2 border-[#5A5A40] rounded-[24px] font-semibold text-lg hover:bg-[#5A5A40]/5 transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                >
                  <div className="flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : <BookOpen size={20} />}
                    <span>Plan Rápido</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest opacity-60">Desde tu biblioteca</span>
                </button>

                <button
                  onClick={generatePlan}
                  disabled={loading}
                  className="py-4 bg-[#5A5A40] text-white rounded-[24px] font-semibold text-lg hover:bg-[#4a4a35] transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-1"
                >
                  <div className="flex items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : <ChefHat size={20} />}
                    <span>Plan Creativo</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest opacity-80">Generado por IA</span>
                </button>
              </div>

              {allRecipes.length < 1 && !loading && (
                <p className="text-center text-[10px] text-black/30 italic">
                  Agregá al menos 1 receta a tu biblioteca para habilitar el Plan Rápido.
                </p>
              )}
            </div>
          </motion.div>
        ) : view === 'plan' ? (
          <div className="space-y-12">
            {/* Day Selector */}
            <div className="flex items-center justify-between bg-white p-4 rounded-[24px] shadow-sm border border-black/5">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPlan([])}
                  className="p-2 hover:bg-[#f5f5f0] rounded-full text-black/40 hover:text-[#5A5A40] transition-colors"
                  title="Nuevo Plan"
                >
                  <RefreshCw size={20} />
                </button>
                <button 
                  onClick={() => setActiveDayIndex(prev => Math.max(0, prev - 1))}
                  disabled={activeDayIndex === 0}
                  className="p-2 hover:bg-[#f5f5f0] rounded-full disabled:opacity-30"
                >
                  <ChevronLeft size={24} />
                </button>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-black/40 mb-1">Día {activeDayIndex + 1} de 7</p>
                <h2 className="text-2xl font-serif italic">{plan[activeDayIndex].day}</h2>
                <div className="mt-2 flex flex-col items-center gap-1">
                  <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-tight text-[#5A5A40]/60">
                    <span>Total diario:</span>
                    <span className={cn(
                      "transition-colors",
                      preferences.calorieLimit && preferences.calorieLimit > 0 && 
                      plan[activeDayIndex].meals.reduce((acc, m) => acc + (m.calories || 0), 0) > preferences.calorieLimit
                        ? "text-red-500"
                        : "text-[#5A5A40]"
                    )}>
                      {plan[activeDayIndex].meals.reduce((acc, m) => acc + (m.calories || 0), 0)} kcal
                      {preferences.calorieLimit && preferences.calorieLimit > 0 && ` / ${preferences.calorieLimit} kcal`}
                    </span>
                  </div>
                  {preferences.calorieLimit && preferences.calorieLimit > 0 && (
                    <div className="w-32 h-1 bg-black/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ 
                          width: `${Math.min(100, (plan[activeDayIndex].meals.reduce((acc, m) => acc + (m.calories || 0), 0) / preferences.calorieLimit) * 100)}%` 
                        }}
                        className={cn(
                          "h-full transition-colors",
                          plan[activeDayIndex].meals.reduce((acc, m) => acc + (m.calories || 0), 0) > preferences.calorieLimit
                            ? "bg-red-500"
                            : "bg-[#5A5A40]"
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setActiveDayIndex(prev => Math.min(6, prev + 1))}
                disabled={activeDayIndex === 6}
                className="p-2 hover:bg-[#f5f5f0] rounded-full disabled:opacity-30"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Nutrition Tip */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#5A5A40]/5 border border-[#5A5A40]/10 rounded-[32px] p-6 flex items-start gap-4"
            >
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#5A5A40] shadow-sm shrink-0">
                <Activity size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-[#5A5A40] mb-1">Tip Nutricional</h3>
                <p className="text-black/60 text-sm italic">"{nutritionTip}"</p>
              </div>
            </motion.div>

            {/* Meals for Active Day */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {plan[activeDayIndex].meals.map((meal, mIdx) => {
                const isFav = favorites.some(f => f.id === meal.id);
                return (
                  <motion.div
                    key={meal.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/10 px-2 py-1 rounded-md w-fit">
                          {meal.type}
                        </span>
                        {meal.calories && (
                          <span className="text-[10px] font-medium text-black/40 px-1">
                            {meal.calories} kcal
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => toggleFavorite(meal)}
                          className={cn(
                            "p-2 rounded-full transition-colors",
                            isFav ? "text-red-500 bg-red-50" : "text-black/40 hover:text-red-500 hover:bg-red-50"
                          )}
                          title={isFav ? "Quitar de favoritos" : "Guardar en favoritos"}
                        >
                          <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                        </button>
                        <button 
                          onClick={() => swapMeal(activeDayIndex, mIdx)}
                          className="p-2 hover:bg-[#f5f5f0] rounded-full text-black/40 hover:text-[#5A5A40] transition-colors"
                          title="Cambiar plato"
                        >
                          <RefreshCw size={16} />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-lg font-medium mb-4 leading-tight min-h-[3rem]">{meal.name}</h3>
                    
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-black/30 mb-2">Ingredientes ({preferences.peopleCount} pers.)</p>
                      <ul className="space-y-1 mb-6">
                        {meal.ingredients.slice(0, 3).map((ing, i) => {
                          const baseAmount = parseFloat(ing.amount.replace(',', '.')) || 0;
                          const scaledAmount = baseAmount * preferences.peopleCount;
                          const displayAmount = scaledAmount % 1 === 0 ? scaledAmount.toString() : scaledAmount.toFixed(1);
                          return (
                            <li key={i} className="text-sm text-black/70 flex justify-between gap-2">
                              <span className="truncate">{ing.name}</span>
                              <span className="text-black/40 whitespace-nowrap">{displayAmount} {ing.unit}</span>
                            </li>
                          );
                        })}
                        {meal.ingredients.length > 3 && (
                          <li className="text-xs text-black/40 italic">+{meal.ingredients.length - 3} más...</li>
                        )}
                      </ul>
                    </div>

                    <button
                      onClick={() => viewRecipe(meal)}
                      className="w-full py-3 border border-[#5A5A40] text-[#5A5A40] rounded-2xl text-sm font-semibold hover:bg-[#5A5A40] hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <ChefHat size={16} />
                      Ver Receta
                    </button>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex justify-center pt-8">
              <button 
                onClick={() => setPlan([])}
                className="text-sm font-medium text-black/40 hover:text-black transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Empezar de nuevo / Cambiar preferencias
              </button>
            </div>
          </div>
        ) : view === 'favorites' ? (
          <div className="space-y-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                <Heart size={24} fill="currentColor" />
              </div>
              <div>
                <h2 className="text-3xl font-serif italic">Tus Favoritos</h2>
                <p className="text-black/40">Recetas guardadas para usar como referencia.</p>
              </div>
            </div>

            {favorites.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-black/10">
                <BookOpen size={48} className="mx-auto text-black/10 mb-4" />
                <p className="text-black/40">Aún no tenés recetas favoritas.</p>
                <button 
                  onClick={() => setView('plan')}
                  className="mt-4 text-[#5A5A40] font-medium hover:underline"
                >
                  Volver al plan
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {favorites.map((meal) => (
                  <motion.div
                    key={meal.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/10 px-2 py-1 rounded-md w-fit">
                          {meal.type}
                        </span>
                        {meal.calories && (
                          <span className="text-[10px] font-medium text-black/40 px-1">
                            {meal.calories} kcal / persona
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => toggleFavorite(meal)}
                          className="p-2 rounded-full text-red-500 bg-red-50"
                        >
                          <Heart size={16} fill="currentColor" />
                        </button>
                        <button 
                          onClick={() => deleteRecipe(meal.id)}
                          className="p-2 hover:bg-red-50 rounded-full text-black/20 hover:text-red-500 transition-colors"
                          title="Eliminar de la biblioteca"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-xl font-medium mb-2 leading-tight min-h-[3rem]">{meal.name}</h3>
                    
                    {meal.macros && (
                      <div className="flex gap-3 mb-4">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Prot</span>
                          <span className="text-xs font-medium text-black/60">{meal.macros.protein || '-'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Carb</span>
                          <span className="text-xs font-medium text-black/60">{meal.macros.carbs || '-'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Grasa</span>
                          <span className="text-xs font-medium text-black/60">{meal.macros.fat || '-'}</span>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => viewRecipe(meal)}
                      className="w-full py-3 border border-[#5A5A40] text-[#5A5A40] rounded-2xl text-sm font-semibold hover:bg-[#5A5A40] hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                      <ChefHat size={16} />
                      Ver Receta
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-full flex items-center justify-center text-[#5A5A40]">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h2 className="text-3xl font-serif italic">Biblioteca de Recetas</h2>
                  <p className="text-black/40">Todas las recetas que has generado.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <div className="flex items-center bg-[#5A5A40]/5 rounded-full p-1 h-[46px]">
                  <button 
                    onClick={() => setLibraryFilter('all')}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-medium transition-all h-full",
                      libraryFilter === 'all' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                    )}
                  >
                    Todas
                  </button>
                  <button 
                    onClick={() => setLibraryFilter('comida')}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-medium transition-all h-full",
                      libraryFilter === 'comida' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                    )}
                  >
                    Comidas
                  </button>
                  <button 
                    onClick={() => setLibraryFilter('colacion')}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-medium transition-all h-full",
                      libraryFilter === 'colacion' ? "bg-white shadow-sm text-[#5A5A40]" : "text-black/40 hover:text-black"
                    )}
                  >
                    Colaciones
                  </button>
                </div>
                <form onSubmit={searchAndAddMeal} className="relative flex-1 sm:w-64">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5A5A40]" size={18} />
                  <input 
                    type="text"
                    placeholder="Agregar nueva..."
                    value={newMealQuery}
                    onChange={(e) => setNewMealQuery(e.target.value)}
                    disabled={searchingMeal}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-[#5A5A40]/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all disabled:opacity-50 text-sm"
                  />
                  {searchingMeal && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#5A5A40]" size={18} />
                  )}
                </form>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                  <input 
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            {allRecipes.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-black/10">
                <Loader2 size={48} className="mx-auto text-black/10 mb-4 animate-spin" />
                <p className="text-black/40">Cargando biblioteca...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {allRecipes
                  .filter(m => {
                    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesFilter = libraryFilter === 'all' || 
                      (libraryFilter === 'comida' && ['Almuerzo', 'Cena'].includes(m.type)) ||
                      (libraryFilter === 'colacion' && ['Desayuno', 'Merienda'].includes(m.type));
                    return matchesSearch && matchesFilter;
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((meal) => {
                    const isFav = favorites.some(f => f.id === meal.id);
                    return (
                      <motion.div
                        key={meal.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 flex flex-col"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] bg-[#5A5A40]/10 px-2 py-1 rounded-md w-fit">
                              {meal.type}
                            </span>
                            {meal.calories && (
                              <span className="text-[10px] font-medium text-black/40 px-1">
                                {meal.calories} kcal / persona
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => toggleFavorite(meal)}
                              className={cn(
                                "p-2 rounded-full transition-colors",
                                isFav ? "text-red-500 bg-red-50" : "text-black/40 hover:text-red-500 hover:bg-red-50"
                              )}
                            >
                              <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                            </button>
                            <button 
                              onClick={() => deleteRecipe(meal.id)}
                              className="p-2 hover:bg-red-50 rounded-full text-black/20 hover:text-red-500 transition-colors"
                              title="Eliminar de la biblioteca"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                        <h3 className="text-xl font-medium mb-2 leading-tight min-h-[3rem]">{meal.name}</h3>
                        
                        {meal.macros && (
                          <div className="flex gap-3 mb-4">
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Prot</span>
                              <span className="text-xs font-medium text-black/60">{meal.macros.protein || '-'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Carb</span>
                              <span className="text-xs font-medium text-black/60">{meal.macros.carbs || '-'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-tighter text-black/30 font-bold">Grasa</span>
                              <span className="text-xs font-medium text-black/60">{meal.macros.fat || '-'}</span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => viewRecipe(meal)}
                          className="w-full py-3 border border-[#5A5A40] text-[#5A5A40] rounded-2xl text-sm font-semibold hover:bg-[#5A5A40] hover:text-white transition-all flex items-center justify-center gap-2"
                        >
                          <ChefHat size={16} />
                          Ver Receta
                        </button>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Recipe Modal */}
      <AnimatePresence>
        {selectedMeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMeal(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 overflow-y-auto">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-[#5A5A40] mb-2 block">Receta Detallada</span>
                    <h2 className="text-3xl font-serif italic">{selectedMeal.name}</h2>
                    {selectedMeal.calories && (
                      <p className="text-sm font-medium text-black/40 mt-1">{selectedMeal.calories} kcal por persona</p>
                    )}
                    {selectedMeal.macros && (
                      <div className="flex gap-4 mt-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-black/30">P: {selectedMeal.macros.protein}</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-black/30">C: {selectedMeal.macros.carbs}</span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-black/30">G: {selectedMeal.macros.fat}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setSelectedMeal(null)}
                    className="p-2 hover:bg-[#f5f5f0] rounded-full"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:italic prose-headings:text-[#5A5A40] prose-p:text-black/70 mb-8">
                  <Markdown>{selectedMeal.recipe || ''}</Markdown>
                </div>

                <div className="bg-[#f5f5f0] rounded-3xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#5A5A40] mb-4">Ingredientes para {preferences.peopleCount} {preferences.peopleCount === 1 ? 'persona' : 'personas'}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                    {selectedMeal.ingredients.map((ing, i) => {
                      const baseAmount = parseFloat(ing.amount.replace(',', '.')) || 0;
                      const scaledAmount = baseAmount * preferences.peopleCount;
                      const displayAmount = scaledAmount % 1 === 0 ? scaledAmount.toString() : scaledAmount.toFixed(1);
                      return (
                        <div key={i} className="flex justify-between text-sm border-b border-black/5 pb-1">
                          <span className="capitalize">{ing.name}</span>
                          <span className="font-medium">{displayAmount} {ing.unit}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="p-6 bg-[#f5f5f0] border-t border-black/5 flex justify-end">
                <button 
                  onClick={() => setSelectedMeal(null)}
                  className="px-8 py-3 bg-[#5A5A40] text-white rounded-2xl font-semibold hover:bg-[#4a4a35] transition-colors"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shopping List Modal */}
      <AnimatePresence>
        {showShoppingList && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShoppingList(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden h-[90vh] flex flex-col"
            >
              <div className="p-8 flex-1 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
                      <ShoppingCart size={20} />
                    </div>
                    <h2 className="text-2xl font-serif italic">Lista de Compras</h2>
                  </div>
                  <button 
                    onClick={() => setShowShoppingList(false)}
                    className="p-2 hover:bg-[#f5f5f0] rounded-full"
                  >
                    <X size={24} />
                  </button>
                </div>

                <p className="text-xs font-semibold uppercase tracking-widest text-black/40 mb-6">Total para {preferences.peopleCount} personas</p>

                {priceError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm">
                    {priceError}
                  </div>
                )}

                <div className="space-y-3">
                  {shoppingList.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-[#f5f5f0] rounded-2xl group cursor-pointer hover:bg-[#5A5A40]/5 transition-colors">
                      <div className="w-6 h-6 rounded-full border-2 border-[#5A5A40]/20 flex items-center justify-center group-hover:border-[#5A5A40] transition-colors">
                        <CheckCircle2 size={14} className="text-[#5A5A40] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex-1 flex justify-between items-center">
                        <div>
                          <p className="font-medium capitalize">{item.name}</p>
                          <p className="text-xs text-black/40">{item.amount} {item.unit}</p>
                        </div>
                        {prices[item.name] && (
                          <span className="text-sm font-semibold text-[#5A5A40]">{prices[item.name]}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {priceSources.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-black/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-3">Fuentes de Precios</p>
                    <div className="flex flex-wrap gap-2">
                      {priceSources.slice(0, 5).map((source, i) => (
                        <a 
                          key={i} 
                          href={source.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[10px] px-2 py-1 bg-black/5 rounded-full hover:bg-black/10 transition-colors max-w-[150px] truncate"
                        >
                          {source.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-8 bg-[#f5f5f0] border-t border-black/5 space-y-3">
                <button 
                  onClick={fetchPrices}
                  disabled={loadingPrices}
                  className="w-full py-4 border border-[#5A5A40] text-[#5A5A40] rounded-[24px] font-semibold hover:bg-[#5A5A40] hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loadingPrices ? <Loader2 className="animate-spin" size={18} /> : <ShoppingCart size={18} />}
                  {loadingPrices ? (
                    <span className="flex flex-col items-center">
                      <span>Buscando precios...</span>
                      <span className="text-[10px] opacity-60">Consultando Google Search</span>
                    </span>
                  ) : 'Estimar Precios (ARS)'}
                </button>
                <button 
                  onClick={() => window.print()}
                  className="w-full py-4 bg-[#5A5A40] text-white rounded-[24px] font-semibold hover:bg-[#4a4a35] transition-all flex items-center justify-center gap-2"
                >
                  Imprimir Lista
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Loading Overlay */}
      {loading && !selectedMeal && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-[#5A5A40] animate-spin mb-4" />
          <p className="text-lg font-serif italic text-[#5A5A40]">Cocinando tu plan...</p>
        </div>
      )}
    </div>
  );
}

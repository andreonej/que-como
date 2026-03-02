import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/preferences", async (req, res) => {
    try {
      const { data: prefs, error } = await supabase
        .from('preferences')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      res.json(prefs || { people_count: 2, restrictions: [], calorie_limit: 2000 });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load preferences" });
    }
  });

  app.post("/api/preferences", async (req, res) => {
    const { people_count, restrictions, calorie_limit } = req.body;
    try {
      const { error } = await supabase
        .from('preferences')
        .upsert({ id: 1, people_count, restrictions, calorie_limit });

      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to save preferences" });
    }
  });

  app.get("/api/recipes", async (req, res) => {
    const { type } = req.query;
    try {
      let query = supabase.from('recipes').select('*').order('name', { ascending: true });

      if (type === 'comida') {
        query = query.in('type', ['Almuerzo', 'Cena']);
      } else if (type === 'colacion') {
        query = query.in('type', ['Desayuno', 'Merienda']);
      }

      const { data: recipes, error } = await query;
      if (error) throw error;

      res.json(recipes?.map(r => ({
        ...r,
        is_favorite: !!r.is_favorite
      })) || []);
    } catch (e) {
      console.error("Error loading recipes", e);
      res.status(500).json({ error: "Failed to load recipes" });
    }
  });

  app.get("/api/favorites", async (req, res) => {
    try {
      const { data: favorites, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('is_favorite', true);

      if (error) throw error;
      res.json(favorites?.map(f => ({
        ...f,
        is_favorite: !!f.is_favorite
      })) || []);
    } catch (e) {
      console.error("Error loading favorites", e);
      res.status(500).json({ error: "Failed to load favorites" });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    const { id, name, type, ingredients, recipe, calories, macros, is_favorite } = req.body;
    try {
      const { error } = await supabase
        .from('recipes')
        .upsert({
          id,
          name,
          type,
          ingredients,
          recipe: recipe || null,
          calories: calories || null,
          macros: macros || null,
          is_favorite: !!is_favorite
        }, { onConflict: 'name' });

      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving recipe:", error);
      res.status(500).json({ error: "Failed to save recipe" });
    }
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    try {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', req.params.id);

      if (error) throw error;
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting recipe:", error);
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const { data: recipe, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', req.params.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (recipe) {
        res.json({
          ...recipe,
          is_favorite: !!recipe.is_favorite
        });
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (e) {
      console.error("Error loading recipe", e);
      res.status(500).json({ error: "Failed to load recipe" });
    }
  });

  app.get("/api/plan", async (req, res) => {
    try {
      const { data: plan, error } = await supabase
        .from('current_plan')
        .select('plan_data')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      res.json(plan ? plan.plan_data : []);
    } catch (e) {
      console.error("Error loading plan", e);
      res.status(500).json({ error: "Failed to load plan" });
    }
  });

  app.post("/api/plan", async (req, res) => {
    const { plan } = req.body;
    try {
      const { error } = await supabase
        .from('current_plan')
        .upsert({ id: 1, plan_data: plan });

      if (error) throw error;
      res.json({ success: true });
    } catch (e) {
      console.error("Error saving plan", e);
      res.status(500).json({ error: "Failed to save plan" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

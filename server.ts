import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("que_como.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    recipe TEXT,
    calories INTEGER,
    macros TEXT,
    is_favorite INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    people_count INTEGER DEFAULT 2,
    restrictions TEXT DEFAULT '[]',
    calorie_limit INTEGER DEFAULT 2000
  );

  CREATE TABLE IF NOT EXISTS current_plan (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    plan_data TEXT NOT NULL
  );
`);

// Migration: Add macros column to recipes if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(recipes)").all() as any[];
const hasMacros = tableInfo.some(column => column.name === 'macros');
if (!hasMacros) {
  db.exec("ALTER TABLE recipes ADD COLUMN macros TEXT");
}

// Migration: Add calorie_limit column to preferences if it doesn't exist
const prefTableInfo = db.prepare("PRAGMA table_info(preferences)").all() as any[];
const hasCalorieLimit = prefTableInfo.some(column => column.name === 'calorie_limit');
if (!hasCalorieLimit) {
  db.exec("ALTER TABLE preferences ADD COLUMN calorie_limit INTEGER DEFAULT 2000");
}

// Cleanup duplicates by name if any exist
try {
  const duplicates = db.prepare(`
    SELECT name, COUNT(*) as count 
    FROM recipes 
    GROUP BY name 
    HAVING count > 1
  `).all() as { name: string }[];

  for (const dup of duplicates) {
    const entries = db.prepare("SELECT id, recipe FROM recipes WHERE name = ? ORDER BY recipe DESC, created_at DESC").all(dup.name) as { id: string }[];
    const [keep, ...remove] = entries;
    if (remove.length > 0) {
      const removeIds = remove.map(r => `'${r.id}'`).join(',');
      db.prepare(`DELETE FROM recipes WHERE id IN (${removeIds})`).run();
    }
  }
} catch (e) {
  console.error("Cleanup error:", e);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/preferences", (req, res) => {
    const prefs = db.prepare("SELECT * FROM preferences WHERE id = 1").get() as any;
    res.json(prefs || { people_count: 2, restrictions: "[]", calorie_limit: 2000 });
  });

  app.post("/api/preferences", (req, res) => {
    const { people_count, restrictions, calorie_limit } = req.body;
    db.prepare(`
      INSERT INTO preferences (id, people_count, restrictions, calorie_limit)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        people_count = excluded.people_count,
        restrictions = excluded.restrictions,
        calorie_limit = excluded.calorie_limit
    `).run(people_count, JSON.stringify(restrictions), calorie_limit);
    res.json({ success: true });
  });

  app.get("/api/recipes", (req, res) => {
    const { type } = req.query;
    let query = "SELECT * FROM recipes";
    const params: any[] = [];

    if (type === 'comida') {
      query += " WHERE type IN ('Almuerzo', 'Cena')";
    } else if (type === 'colacion') {
      query += " WHERE type IN ('Desayuno', 'Merienda')";
    }

    query += " ORDER BY name ASC";

    const recipes = db.prepare(query).all(...params) as any[];
    res.json(recipes.map(r => ({
      ...r,
      ingredients: JSON.parse(r.ingredients as string),
      macros: r.macros ? JSON.parse(r.macros as string) : null,
      is_favorite: !!r.is_favorite
    })));
  });

  app.get("/api/favorites", (req, res) => {
    const favorites = db.prepare("SELECT * FROM recipes WHERE is_favorite = 1").all() as any[];
    res.json(favorites.map(f => ({
      ...f,
      ingredients: JSON.parse(f.ingredients as string),
      macros: f.macros ? JSON.parse(f.macros as string) : null,
      is_favorite: !!f.is_favorite
    })));
  });

  app.post("/api/recipes", (req, res) => {
    const { id, name, type, ingredients, recipe, calories, macros, is_favorite } = req.body;
    try {
      db.prepare(`
        INSERT INTO recipes (id, name, type, ingredients, recipe, calories, macros, is_favorite)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          is_favorite = excluded.is_favorite,
          recipe = COALESCE(excluded.recipe, recipes.recipe),
          ingredients = excluded.ingredients,
          type = excluded.type,
          calories = excluded.calories,
          macros = excluded.macros
      `).run(id, name, type, JSON.stringify(ingredients), recipe || null, calories || null, macros ? JSON.stringify(macros) : null, is_favorite ? 1 : 0);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving recipe:", error);
      res.status(500).json({ error: "Failed to save recipe" });
    }
  });

  app.delete("/api/recipes/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM recipes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting recipe:", error);
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  app.get("/api/recipes/:id", (req, res) => {
    const recipe = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
    if (recipe) {
      res.json({
        ...recipe,
        ingredients: JSON.parse(recipe.ingredients as string),
        is_favorite: !!recipe.is_favorite
      });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.get("/api/plan", (req, res) => {
    const plan = db.prepare("SELECT plan_data FROM current_plan WHERE id = 1").get() as any;
    res.json(plan ? JSON.parse(plan.plan_data) : []);
  });

  app.post("/api/plan", (req, res) => {
    const { plan } = req.body;
    db.prepare(`
      INSERT INTO current_plan (id, plan_data)
      VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET plan_data = excluded.plan_data
    `).run(JSON.stringify(plan));
    res.json({ success: true });
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

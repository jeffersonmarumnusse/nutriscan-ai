import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

export const saveProfile = async (userId: string, profile: any) => {
  if (!supabase) return { data: null, error: new Error("Supabase not configured. Check environment variables.") };
  
  console.log("Attempting to save profile for user:", userId);
  // Map camelCase to snake_case
  const profileData = {
    id: userId,
    name: profile.name,
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    gender: profile.gender,
    activity_level: profile.activityLevel,
    goal: profile.goal,
    restrictions: profile.restrictions
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profileData)
    .select();
  return { data, error };
};

export const saveMeal = async (userId: string, meal: any) => {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  
  // Map camelCase to snake_case for Supabase
  const mealData = {
    id: meal.id,
    user_id: userId,
    timestamp: meal.timestamp,
    image_url: meal.imageUrl,
    items: meal.items,
    total_calories: meal.totalCalories
  };

  const { data, error } = await supabase
    .from('meals')
    .insert(mealData)
    .select();
  return { data, error };
};

export const getMeals = async (userId: string) => {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });
  
  // Map snake_case back to camelCase for frontend
  const mappedData = data?.map(meal => ({
    id: meal.id,
    timestamp: meal.timestamp,
    imageUrl: meal.image_url,
    items: meal.items,
    totalCalories: meal.total_calories
  }));

  return { data: mappedData, error };
};

export const getProfile = async (userId: string) => {
  if (!supabase) return { data: null, error: new Error("Supabase not configured") };
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (data) {
    // Map snake_case back to camelCase
    const mappedProfile = {
      weight: data.weight,
      height: data.height,
      age: data.age,
      gender: data.gender,
      activityLevel: data.activity_level,
      goal: data.goal,
      restrictions: data.restrictions
    };
    return { data: mappedProfile, error };
  }
  
  return { data, error };
};

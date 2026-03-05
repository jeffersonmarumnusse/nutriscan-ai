export enum ActivityLevel {
  SEDENTARY = 'sedentary',
  LIGHT = 'light',
  MODERATE = 'moderate',
  ACTIVE = 'active',
  VERY_ACTIVE = 'very_active'
}

export enum Goal {
  LOSE_WEIGHT = 'lose_weight',
  MAINTAIN = 'maintain',
  GAIN_MUSCLE = 'gain_muscle'
}

export interface UserProfile {
  weight: number; // kg
  height: number; // cm
  age: number;
  gender: 'male' | 'female';
  activityLevel: ActivityLevel;
  goal: Goal;
  restrictions?: string;
}

export interface NutritionStats {
  bmi: number;
  bmr: number;
  tdee: number; // Total Daily Energy Expenditure
  macros: {
    protein: number;
    carbs: number;
    fats: number;
  };
}

export interface FoodItem {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  portion: string;
}

export interface ScannedMeal {
  id: string;
  timestamp: number;
  imageUrl: string;
  items: FoodItem[];
  totalCalories: number;
}

export interface MealPlan {
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks: string;
}

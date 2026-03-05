import { ActivityLevel, Goal, NutritionStats, UserProfile } from "../types";

export const calculateNutrition = (profile: UserProfile): NutritionStats => {
  // BMI
  const heightInMeters = profile.height / 100;
  const bmi = profile.weight / (heightInMeters * heightInMeters);

  // BMR (Mifflin-St Jeor Equation)
  let bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
  if (profile.gender === 'male') {
    bmr += 5;
  } else {
    bmr -= 161;
  }

  // TDEE
  const activityMultipliers = {
    [ActivityLevel.SEDENTARY]: 1.2,
    [ActivityLevel.LIGHT]: 1.375,
    [ActivityLevel.MODERATE]: 1.55,
    [ActivityLevel.ACTIVE]: 1.725,
    [ActivityLevel.VERY_ACTIVE]: 1.9,
  };

  let tdee = bmr * activityMultipliers[profile.activityLevel];

  // Adjust for Goal
  if (profile.goal === Goal.LOSE_WEIGHT) {
    tdee -= 500;
  } else if (profile.goal === Goal.GAIN_MUSCLE) {
    tdee += 300;
  }

  // Macros (General recommendation)
  // Protein: 2g per kg for gain, 1.8g for loss, 1.2g for maintain
  let proteinPerKg = 1.2;
  if (profile.goal === Goal.GAIN_MUSCLE) proteinPerKg = 2.0;
  if (profile.goal === Goal.LOSE_WEIGHT) proteinPerKg = 1.8;

  const protein = profile.weight * proteinPerKg;
  const proteinCalories = protein * 4;
  
  // Fat: 25% of total calories
  const fatCalories = tdee * 0.25;
  const fats = fatCalories / 9;

  // Carbs: Remaining calories
  const carbCalories = tdee - proteinCalories - fatCalories;
  const carbs = carbCalories / 4;

  return {
    bmi,
    bmr,
    tdee,
    macros: {
      protein,
      carbs,
      fats
    }
  };
};

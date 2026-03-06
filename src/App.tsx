/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  User,
  History,
  Utensils,
  Plus,
  ChevronRight,
  Scale,
  Activity,
  Flame,
  Loader2,
  X,
  Check,
  ArrowRight,
  Dumbbell,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import {
  UserProfile,
  ActivityLevel,
  Goal,
  NutritionStats,
  ScannedMeal,
  FoodItem,
  WorkoutInfo
} from './types';
import { calculateNutrition } from './utils/nutrition';
import { compressImage } from './utils/image';
import { scanPlate, generateMealPlan, getWorkoutInfo } from './services/geminiService';
import { saveProfile, saveMeal, getMeals, getProfile, saveWorkout } from './services/supabaseService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Card = ({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) => (
  <div id={id} className={cn("bg-white rounded-3xl p-6 shadow-sm border border-black/5", className)}>
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  isLoading,
  id
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  id?: string;
}) => {
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700",
    secondary: "bg-black text-white hover:bg-zinc-800",
    outline: "border border-black/10 hover:bg-black/5",
    ghost: "hover:bg-black/5"
  };

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "px-6 py-3 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Ops! Algo deu errado.</h1>
            <p className="text-zinc-600 mb-6">O aplicativo encontrou um erro inesperado (possivelmente cache antigo).</p>
            <pre className="bg-zinc-100 p-4 rounded-xl text-xs overflow-auto mb-6 text-left">
              {this.state.error?.message}
            </pre>
            <div className="flex flex-col gap-3">
              <Button onClick={() => window.location.reload()} className="w-full">
                Tentar Novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="w-full text-red-600 border-red-100 hover:bg-red-50"
              >
                Limpar Tudo e Reiniciar
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App ---

export default function App() {
  useEffect(() => {
    // Cleanup old keys that are no longer used to prevent parsing errors
    const oldKeys = ['nutriscan_github_user'];
    oldKeys.forEach(key => localStorage.removeItem(key));
  }, []);

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'diary' | 'menu' | 'workouts'>('home');
  const [userId, setUserId] = useState(() => {
    try {
      const saved = localStorage.getItem('nutriscan_user_id');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (saved && uuidRegex.test(saved)) return saved;
    } catch (e) {
      console.error("Error reading userId from localStorage", e);
    }
    const newId = crypto.randomUUID();
    localStorage.setItem('nutriscan_user_id', newId);
    return newId;
  });

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<NutritionStats | null>(null);
  const [meals, setMeals] = useState<ScannedMeal[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [mealPlan, setMealPlan] = useState<string | null>(null);
  const [isGeneratingMenu, setIsGeneratingMenu] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Default profile to avoid null issues
  const defaultProfile: UserProfile = {
    name: '',
    weight: 70,
    height: 170,
    age: 30,
    gender: 'male',
    activityLevel: ActivityLevel.MODERATE,
    goal: Goal.MAINTAIN,
    restrictions: ''
  };

  // Initial Load
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        // 1. Try Local Storage first for speed
        const savedProfile = localStorage.getItem('nutriscan_profile');
        if (savedProfile) {
          setProfile(JSON.parse(savedProfile));
        }

        // 2. Try Supabase
        const { data: profileData, error: profileError } = await getProfile(userId);

        if (profileData) {
          const mergedProfile = { ...defaultProfile, ...profileData };
          setProfile(mergedProfile as UserProfile);
          localStorage.setItem('nutriscan_profile', JSON.stringify(mergedProfile));
        } else {
          // If Supabase doesn't have it, but we have it locally or want default
          const profileToSave = savedProfile ? JSON.parse(savedProfile) : defaultProfile;
          setProfile(profileToSave);

          // Force save to Supabase to prevent Foreign Key errors later
          console.log("Syncing profile to Supabase on startup...");
          await saveProfile(userId, profileToSave);
        }

        const { data: mealsData } = await getMeals(userId);
        if (mealsData) {
          setMeals(mealsData as ScannedMeal[]);
        }
      } catch (err) {
        console.error("Error loading data", err);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [userId]);

  // Save to LocalStorage on change
  useEffect(() => {
    if (profile) {
      localStorage.setItem('nutriscan_profile', JSON.stringify(profile));
    }
  }, [profile]);

  const [workoutSearch, setWorkoutSearch] = useState('');
  const [workoutInfo, setWorkoutInfo] = useState<WorkoutInfo | null>(null);
  const [isSearchingWorkout, setIsSearchingWorkout] = useState(false);

  // Update Stats and Sync Profile
  useEffect(() => {
    if (profile) {
      setStats(calculateNutrition(profile));
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);
    setDbError(null);
    try {
      const { error } = await saveProfile(userId, profile);
      if (error) {
        setDbError(error.message);
        console.error("Error syncing profile to Supabase:", error);
      } else {
        alert("Perfil salvo com sucesso no banco de dados!");
        setActiveTab('home');
      }
    } catch (err: any) {
      setDbError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const originalBase64 = reader.result as string;
        console.log("Image loaded, starting compression...");

        // Compress image before sending to Gemini and Supabase
        const compressedBase64WithHeader = await compressImage(originalBase64);
        const compressedBase64 = compressedBase64WithHeader.split(',')[1];

        console.log("Image compressed, calling Gemini...");
        const items = await scanPlate(compressedBase64, 'image/jpeg');
        console.log("Gemini response items:", items);

        if (items && items.length > 0) {
          // Fallback for crypto.randomUUID if not available
          const generateId = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
              return crypto.randomUUID();
            }
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          };

          const newMeal: ScannedMeal = {
            id: generateId(),
            timestamp: Date.now(),
            imageUrl: compressedBase64WithHeader,
            items,
            totalCalories: items.reduce((acc, item) => acc + item.calories, 0)
          };

          console.log("Saving meal to Supabase...");
          const { error: saveError } = await saveMeal(userId, newMeal);

          // If we get a foreign key error, it means the profile doesn't exist in DB yet.
          if (saveError && saveError.message.includes('foreign key constraint')) {
            console.log("Profile not found in DB, saving profile first...");
            await saveProfile(userId, profile || defaultProfile);
            const { error: retryError } = await saveMeal(userId, newMeal);
            if (retryError) {
              console.error("Error saving meal after profile retry:", retryError);
              alert("Erro ao salvar no banco: " + retryError.message);
            } else {
              setMeals(prev => [newMeal, ...prev]);
              setActiveTab('diary');
            }
          } else if (saveError) {
            console.error("Error saving meal to Supabase:", saveError);
            alert("Refeição analisada, mas não pôde ser salva no banco: " + saveError.message);
          } else {
            setMeals(prev => [newMeal, ...prev]);
            setActiveTab('diary');
          }
        } else {
          alert("Não foi possível identificar os alimentos na imagem. Tente outra foto ou verifique sua chave de API.");
        }
      } catch (error: any) {
        console.error("Error scanning plate:", error);
        // Look for detailed error in session storage or logs if needed
        alert("Erro na análise: " + (error.message || "Erro desconhecido") + ". Verifique o Console (F12) para detalhes técnicos.");
      } finally {
        setIsScanning(false);
      }
    };
    reader.onerror = () => {
      console.error("FileReader error");
      alert("Erro ao ler o arquivo de imagem.");
      setIsScanning(false);
    };
    reader.readAsDataURL(file);
  }, [userId, profile, defaultProfile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const handleGenerateMenu = async () => {
    if (!profile || !stats) return;
    setIsGeneratingMenu(true);
    const plan = await generateMealPlan(profile, stats);
    setMealPlan(plan);
    setIsGeneratingMenu(false);
  };

  const handleSearchWorkout = async () => {
    if (!workoutSearch.trim()) return;
    setIsSearchingWorkout(true);
    try {
      const info = await getWorkoutInfo(workoutSearch, profile?.restrictions || "");
      if (info) {
        setWorkoutInfo(info);
        await saveWorkout(userId, info);
      } else {
        alert("Não foi possível encontrar informações sobre este treino.");
      }
    } catch (err) {
      console.error("Error searching workout:", err);
    } finally {
      setIsSearchingWorkout(false);
    }
  };

  const todayCalories = meals
    .filter(m => new Date(m.timestamp).toDateString() === new Date().toDateString())
    .reduce((acc, m) => acc + m.totalCalories, 0);

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
          <p className="font-medium text-zinc-500">Carregando seus dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-20 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
              <Utensils className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">NutriScan AI</h1>
          </div>
          <div className="flex items-center gap-3">
            {profile && stats && !isNaN(stats.bmi) && (
              <div className="flex items-center gap-2 text-sm font-medium bg-zinc-100 px-3 py-1.5 rounded-full">
                <Scale className="w-4 h-4 text-emerald-600" />
                <span>{stats.bmi.toFixed(1)} IMC</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {!profile ? (
                <Card className="bg-emerald-50 border-emerald-100">
                  <h2 className="text-xl font-bold mb-2">Bem-vindo ao NutriScan!</h2>
                  <p className="text-zinc-600 mb-6">Para começar, precisamos configurar seu perfil nutricional.</p>
                  <Button onClick={() => setActiveTab('profile')} className="w-full">
                    Configurar Perfil <ChevronRight className="w-4 h-4" />
                  </Button>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-emerald-600 text-white border-none">
                      <div className="flex flex-col h-full justify-between">
                        <Flame className="w-6 h-6 mb-4 opacity-80" />
                        <div>
                          <p className="text-sm opacity-80">Meta Diária</p>
                          <p className="text-3xl font-bold">{Math.round(stats?.tdee || 0)}</p>
                          <p className="text-xs opacity-60">kcal</p>
                        </div>
                      </div>
                    </Card>
                    <Card>
                      <div className="flex flex-col h-full justify-between">
                        <Activity className="w-6 h-6 mb-4 text-emerald-600" />
                        <div>
                          <p className="text-sm text-zinc-500">Consumido Hoje</p>
                          <p className="text-3xl font-bold">{Math.round(todayCalories)}</p>
                          <p className="text-xs text-zinc-400">kcal</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div {...getRootProps()} className={cn(
                    "border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center transition-all cursor-pointer",
                    isDragActive ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-white hover:border-emerald-300",
                    isScanning && "opacity-50 pointer-events-none"
                  )}>
                    <input {...getInputProps()} />
                    {isScanning ? (
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
                        <p className="font-medium">Analisando seu prato...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4">
                          <Camera className="w-8 h-8" />
                        </div>
                        <p className="font-bold text-lg">Escanear Prato</p>
                        <p className="text-zinc-500 text-sm text-center mt-1">Tire uma foto ou arraste uma imagem aqui</p>
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">Últimas Refeições</h3>
                      <button onClick={() => setActiveTab('diary')} className="text-emerald-600 text-sm font-medium">Ver tudo</button>
                    </div>
                    {meals.slice(0, 2).map(meal => (
                      <Card key={meal.id} className="p-4 flex gap-4 items-center">
                        <img src={meal.imageUrl} className="w-16 h-16 rounded-xl object-cover" alt="Meal" />
                        <div className="flex-1">
                          <p className="font-bold">{meal.items.map(i => i.name).join(', ').substring(0, 30)}...</p>
                          <p className="text-sm text-zinc-500">{new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">{meal.totalCalories} kcal</p>
                        </div>
                      </Card>
                    ))}
                    {meals.length === 0 && (
                      <p className="text-center text-zinc-400 py-8 italic">Nenhuma refeição registrada ainda.</p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          ) : activeTab === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold">Seu Perfil</h2>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-100 w-fit">
                  <div className={cn("w-2 h-2 rounded-full", import.meta.env.VITE_SUPABASE_URL ? "bg-emerald-500" : "bg-red-500")} />
                  <span className="text-zinc-500 uppercase tracking-wider">
                    Status do Banco: {import.meta.env.VITE_SUPABASE_URL ? "Conectado" : "Desconectado (Verifique a Vercel)"}
                  </span>
                </div>

                {dbError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm">
                    <p className="font-bold mb-1">Erro de Conexão:</p>
                    <p className="font-mono text-xs">{dbError}</p>
                    <p className="mt-2 text-xs opacity-80">Dica: Verifique se as tabelas 'profiles' e 'meals' existem no Supabase e se o RLS está liberado.</p>
                  </div>
                )}
              </div>

              <Card className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-500">Nome do Aluno</label>
                  <input
                    type="text"
                    placeholder="Seu nome completo"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={profile?.name || ''}
                    onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), name: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Peso (kg)</label>
                    <input
                      type="number"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.weight || ''}
                      onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), weight: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Altura (cm)</label>
                    <input
                      type="number"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.height || ''}
                      onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), height: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Idade</label>
                    <input
                      type="number"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.age || ''}
                      onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), age: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Gênero</label>
                    <select
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.gender || 'male'}
                      onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), gender: e.target.value as 'male' | 'female' }))}
                    >
                      <option value="male">Masculino</option>
                      <option value="female">Feminino</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-500">Nível de Atividade</label>
                  <select
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={profile?.activityLevel || ActivityLevel.SEDENTARY}
                    onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), activityLevel: e.target.value as ActivityLevel }))}
                  >
                    <option value={ActivityLevel.SEDENTARY}>Sedentário (Pouco ou nenhum exercício)</option>
                    <option value={ActivityLevel.LIGHT}>Leve (1-3 dias/semana)</option>
                    <option value={ActivityLevel.MODERATE}>Moderado (3-5 dias/semana)</option>
                    <option value={ActivityLevel.ACTIVE}>Ativo (6-7 dias/semana)</option>
                    <option value={ActivityLevel.VERY_ACTIVE}>Muito Ativo (Atleta/Trabalho pesado)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-500">Objetivo</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: Goal.LOSE_WEIGHT, label: 'Perder Peso' },
                      { id: Goal.MAINTAIN, label: 'Manter' },
                      { id: Goal.GAIN_MUSCLE, label: 'Ganhar Massa' }
                    ].map(g => (
                      <button
                        key={g.id}
                        onClick={() => setProfile(prev => ({ ...(prev || defaultProfile), goal: g.id }))}
                        className={cn(
                          "px-2 py-3 rounded-xl text-xs font-bold transition-all border",
                          profile?.goal === g.id
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-white text-zinc-500 border-zinc-200 hover:border-emerald-300"
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-500">Restrições ou Alergias</label>
                  <input
                    type="text"
                    placeholder="Ex: Lactose, Glúten, Amendoim..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={profile?.restrictions || ''}
                    onChange={e => setProfile(prev => ({ ...(prev || defaultProfile), restrictions: e.target.value }))}
                  />
                </div>

                {stats && (
                  <div className="pt-6 border-t border-zinc-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">IMC</span>
                      <span className="font-bold">{stats.bmi.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">TMB (Metabolismo Basal)</span>
                      <span className="font-bold">{Math.round(stats.bmr)} kcal</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 text-sm">Necessidade Diária (TDEE)</span>
                      <span className="font-bold text-emerald-600">{Math.round(stats.tdee)} kcal</span>
                    </div>
                  </div>
                )}
              </Card>
              <Button
                onClick={handleSaveProfile}
                isLoading={isSaving}
                className="w-full"
              >
                Salvar Perfil no Banco de Dados
              </Button>
            </motion.div>
          ) : activeTab === 'workouts' ? (
            <motion.div
              key="workouts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white">
                  <Dumbbell className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Kross Zone</h2>
                  <p className="text-zinc-500 text-sm">Inteligência de Treino</p>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Qual o treino de hoje? (ex: Miami Nights)"
                  className="w-full bg-white border border-black/10 rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm font-medium"
                  value={workoutSearch}
                  onChange={e => setWorkoutSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchWorkout()}
                />
                <button
                  onClick={handleSearchWorkout}
                  disabled={isSearchingWorkout}
                  className="absolute right-2 top-2 bottom-2 w-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSearchingWorkout ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                </button>
              </div>

              {workoutInfo && (
                <div className="space-y-6">
                  <Card className="bg-zinc-900 text-white border-none overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <Dumbbell className="w-24 h-24" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-4">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          workoutInfo.type === 'Cardio' ? "bg-red-500" :
                            workoutInfo.type === 'Força' ? "bg-blue-500" : "bg-purple-500"
                        )}>
                          {workoutInfo.type}
                        </span>
                        <span className="text-zinc-400 text-xs">• Kross Zone Original</span>
                      </div>
                      <h3 className="text-3xl font-bold mb-2">{workoutInfo.name}</h3>
                      <p className="text-zinc-400 text-sm italic leading-relaxed">"{workoutInfo.summary}"</p>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4 bg-white">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Estrutura</p>
                      <div className="space-y-1">
                        <p className="text-sm font-bold">{workoutInfo.structure.stations} Estações</p>
                        <p className="text-sm font-bold">{workoutInfo.structure.pods} Pods • {workoutInfo.structure.laps} Laps</p>
                      </div>
                    </Card>
                    <Card className="p-4 bg-white">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Timing</p>
                      <p className="text-lg font-bold text-emerald-600">{workoutInfo.structure.timing}</p>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-bold text-lg flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-600" />
                      Exercícios & Smart Swaps
                    </h4>
                    {workoutInfo.exercises.map((ex, idx) => (
                      <Card key={idx} className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase">Original</p>
                            <p className="font-bold text-zinc-900">{ex.original}</p>
                          </div>
                          <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold">
                            Estação {idx + 1}
                          </div>
                        </div>
                        <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                          <div className="flex items-center gap-2 mb-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Smart Swap</p>
                          </div>
                          <p className="text-sm font-bold text-zinc-800">{ex.swap}</p>
                          <p className="text-xs text-zinc-500 mt-1">{ex.reason}</p>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <a
                    href={workoutInfo.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-black text-white py-5 rounded-3xl font-bold hover:bg-zinc-800 transition-all"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Assistir Demonstração do Treino
                  </a>
                </div>
              )}

              {!workoutInfo && !isSearchingWorkout && (
                <div className="text-center py-12 opacity-30">
                  <Dumbbell className="w-16 h-16 mx-auto mb-4" />
                  <p className="font-medium">Digite o nome de um treino para começar</p>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'diary' ? (
            <motion.div
              key="diary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Histórico</h2>
                <button
                  onClick={() => { if (confirm('Limpar histórico?')) setMeals([]) }}
                  className="text-red-500 text-sm font-medium"
                >
                  Limpar
                </button>
              </div>

              <div className="space-y-4">
                {meals.map(meal => (
                  <Card key={meal.id} className="overflow-hidden p-0">
                    <div className="flex">
                      <img src={meal.imageUrl} className="w-32 h-32 object-cover" alt="Meal" />
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-xs text-zinc-400 mb-1">
                            {new Date(meal.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {meal.items.map((item, idx) => (
                              <span key={idx} className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded-full text-zinc-600">
                                {item.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-end justify-between">
                          <p className="font-bold text-xl text-emerald-600">{meal.totalCalories} <span className="text-xs font-normal text-zinc-400">kcal</span></p>
                          <div className="flex gap-3 text-[10px] font-bold text-zinc-400">
                            <span>P: {meal.items.reduce((a, b) => a + b.protein, 0).toFixed(0)}g</span>
                            <span>C: {meal.items.reduce((a, b) => a + b.carbs, 0).toFixed(0)}g</span>
                            <span>G: {meal.items.reduce((a, b) => a + b.fats, 0).toFixed(0)}g</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {meals.length === 0 && (
                  <div className="text-center py-20">
                    <History className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                    <p className="text-zinc-400">Seu diário está vazio.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'menu' ? (
            <motion.div
              key="menu"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold">Sugestão de Cardápio</h2>

              {!mealPlan ? (
                <Card className="text-center py-12">
                  <Utensils className="w-12 h-12 text-emerald-100 mx-auto mb-4" />
                  <p className="text-zinc-600 mb-6">Gere um cardápio personalizado baseado nos seus objetivos e necessidades calóricas.</p>
                  <Button
                    onClick={handleGenerateMenu}
                    isLoading={isGeneratingMenu}
                    className="w-full"
                  >
                    Gerar Cardápio com IA
                  </Button>
                </Card>
              ) : (
                <div className="space-y-6">
                  <Card className="prose prose-emerald max-w-none">
                    <div className="markdown-body">
                      <Markdown>{mealPlan}</Markdown>
                    </div>
                  </Card>
                  <Button variant="outline" onClick={handleGenerateMenu} isLoading={isGeneratingMenu} className="w-full">
                    Gerar nova sugestão
                  </Button>
                </div>
              )}

              {stats && (
                <Card className="bg-zinc-900 text-white">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-500" />
                    Metas de Macronutrientes
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 mb-1">Proteínas</p>
                      <p className="text-xl font-bold">{Math.round(stats.macros.protein)}g</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 mb-1">Carbos</p>
                      <p className="text-xl font-bold">{Math.round(stats.macros.carbs)}g</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-zinc-400 mb-1">Gorduras</p>
                      <p className="text-xl font-bold">{Math.round(stats.macros.fats)}g</p>
                    </div>
                  </div>
                </Card>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 px-6 py-3 z-30">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <NavButton
            active={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
            icon={<Utensils className="w-6 h-6" />}
            label="Início"
          />
          <NavButton
            active={activeTab === 'diary'}
            onClick={() => setActiveTab('diary')}
            icon={<History className="w-6 h-6" />}
            label="Diário"
          />
          <NavButton
            active={activeTab === 'workouts'}
            onClick={() => setActiveTab('workouts')}
            icon={<Dumbbell className="w-6 h-6" />}
            label="Treino"
          />
          <NavButton
            active={activeTab === 'menu'}
            onClick={() => setActiveTab('menu')}
            icon={<Plus className="w-6 h-6" />}
            label="Cardápio"
          />
          <NavButton
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            icon={<User className="w-6 h-6" />}
            label="Perfil"
          />
        </div>
      </nav>
      {import.meta.env.PROD && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title=""
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-emerald-600" : "text-zinc-400 hover:text-zinc-600"
      )}
    >
      <div className={cn(
        "p-2 rounded-2xl transition-all",
        active ? "bg-emerald-50" : "bg-transparent"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

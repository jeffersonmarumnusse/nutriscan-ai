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
  ArrowRight
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
  FoodItem 
} from './types';
import { calculateNutrition } from './utils/nutrition';
import { scanPlate, generateMealPlan } from './services/geminiService';
import { saveProfile, saveMeal, getMeals, getProfile } from './services/supabaseService';

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
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'diary' | 'menu'>('home');
  const [userId, setUserId] = useState(() => {
    try {
      const saved = localStorage.getItem('nutriscan_user_id');
      if (saved && saved !== 'undefined' && saved !== 'null') return saved;
    } catch (e) {
      console.error("Error reading userId from localStorage", e);
    }
    const newId = Math.random().toString(36).substr(2, 9);
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

  // Initial Load
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const { data: profileData } = await getProfile(userId);
        if (profileData) {
          setProfile(profileData as UserProfile);
        }

        const { data: mealsData } = await getMeals(userId);
        if (mealsData) {
          setMeals(mealsData as ScannedMeal[]);
        }
      } catch (err) {
        console.error("Error loading data from Supabase", err);
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [userId]);

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
        const base64 = (reader.result as string).split(',')[1];
        const items = await scanPlate(base64, file.type);
        
        if (items && items.length > 0) {
          const newMeal: ScannedMeal = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            imageUrl: reader.result as string,
            items,
            totalCalories: items.reduce((acc, item) => acc + item.calories, 0)
          };
          
          const { error: saveError } = await saveMeal(userId, newMeal);
          if (saveError) {
            console.error("Error saving meal to Supabase:", saveError);
            alert("Refeição analisada, mas não pôde ser salva no banco: " + saveError.message);
          } else {
            setMeals(prev => [newMeal, ...prev]);
            setActiveTab('diary');
          }
        } else {
          alert("Não foi possível identificar os alimentos na imagem. Tente outra foto.");
        }
      } catch (error) {
        console.error("Error scanning plate:", error);
        alert("Ocorreu um erro ao analisar a imagem.");
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }, [userId]);

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
            {profile && (
              <div className="flex items-center gap-2 text-sm font-medium bg-zinc-100 px-3 py-1.5 rounded-full">
                <Scale className="w-4 h-4 text-emerald-600" />
                <span>{stats?.bmi.toFixed(1)} IMC</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
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
          )}

          {activeTab === 'profile' && (
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Peso (kg)</label>
                    <input 
                      type="number" 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.weight || ''}
                      onChange={e => setProfile(prev => ({ ...prev!, weight: Number(e.target.value) } as UserProfile))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Altura (cm)</label>
                    <input 
                      type="number" 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.height || ''}
                      onChange={e => setProfile(prev => ({ ...prev!, height: Number(e.target.value) } as UserProfile))}
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
                      onChange={e => setProfile(prev => ({ ...prev!, age: Number(e.target.value) } as UserProfile))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Gênero</label>
                    <select 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={profile?.gender || 'male'}
                      onChange={e => setProfile(prev => ({ ...prev!, gender: e.target.value as 'male' | 'female' } as UserProfile))}
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
                    onChange={e => setProfile(prev => ({ ...prev!, activityLevel: e.target.value as ActivityLevel } as UserProfile))}
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
                        onClick={() => setProfile(prev => ({ ...prev!, goal: g.id } as UserProfile))}
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
                    onChange={e => setProfile(prev => ({ ...prev!, restrictions: e.target.value } as UserProfile))}
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
          )}

          {activeTab === 'diary' && (
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
                  onClick={() => { if(confirm('Limpar histórico?')) setMeals([]) }}
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
          )}

          {activeTab === 'menu' && (
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
          )}
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

# NutriScan AI 🥗

<!-- Triggering re-sync -->

O NutriScan AI é um assistente nutricional inteligente que utiliza a API do Google Gemini para analisar fotos de pratos e sugerir cardápios personalizados.

## 🚀 Funcionalidades

- **Scan de Pratos**: Tire uma foto da sua refeição e receba uma estimativa de calorias e macronutrientes.
- **Diário Nutricional**: Acompanhe seu histórico de refeições salvas no Supabase.
- **Cardápio Personalizado**: Gere sugestões de refeições baseadas no seu perfil e metas.
- **Perfil Customizado**: Configure suas metas, restrições e alergias.

## 🛠️ Tecnologias

- **Frontend**: React + Vite + Tailwind CSS
- **IA**: Google Gemini API (gemini-3-flash-preview)
- **Banco de Dados**: Supabase
- **Animações**: Motion (Framer Motion)
- **Ícones**: Lucide React

## ⚙️ Configuração

Para rodar este projeto localmente ou fazer o deploy, você precisará configurar as seguintes variáveis de ambiente:

1. Crie um arquivo `.env` na raiz do projeto.
2. Adicione as seguintes chaves:

```env
VITE_GEMINI_API_KEY=sua_chave_aqui
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
```

## 📦 Instalação

```bash
# Instalar dependências
npm install

# Rodar em modo de desenvolvimento
npm run dev

# Gerar build para produção
npm run build
```

## 🌐 Deploy

Este projeto está pronto para ser implantado na **Vercel** ou **Netlify**. 
Basta conectar seu repositório do GitHub e configurar as variáveis de ambiente no painel da plataforma escolhida.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { io, Socket } from 'socket.io-client';
import { 
  INFLUENCER_CATEGORIES, 
  INFLUENCER_BLOCKS, 
  GENERAL_CATEGORIES, 
  GENERAL_BLOCKS, 
  ALL_CATEGORIES, 
  ALL_BLOCKS 
} from './constants';
import { CategoryAndPromptManager } from './components/CategoryAndPromptManager';
import { Block, CategoryId, WorkMode, PromptSession, CustomCategory, CustomBlock, User, NewsItem, SavedPrompt, PromptFolder } from './types';
import { generateCohesivePrompt, analyzeChatInput, suggestRelatedBlocks, analyzeImageForPrompt, PromptSegment, enhancePrompt, adaptPromptToModel } from './services/geminiService';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, setDoc, deleteDoc, getDoc, updateDoc, where } from 'firebase/firestore';

export default function App() {
  const [selectedBlocks, setSelectedBlocks] = useState<Block[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('result');
  const [workMode, setWorkMode] = useState<WorkMode>('prompting');
  
  // Prompt compilation state
  const [promptSegments, setPromptSegments] = useState<PromptSegment[]>([]);
  const [compiledPrompt, setCompiledPrompt] = useState<string>('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [customInstructions, setCustomInstructions] = useState<string[]>([]);
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState<Block[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionPage, setSuggestionPage] = useState(0);
  const SUGGESTIONS_PER_PAGE = 5;

  // Global Toggles
  const [isNsfwEnabled, setIsNsfwEnabled] = useState(false);
  const [isSubstitutionEnabled, setIsSubstitutionEnabled] = useState(false);
  const [showNsfwWarning, setShowNsfwWarning] = useState(false);

  // Refs
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Languages
  const [outputLanguage, setOutputLanguage] = useState<'es' | 'en'>('en');

  // Undo History
  const [undoStack, setUndoStack] = useState<{blocks: Block[], instructions: string[]}[]>([]);

  // Banned Words
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [bannedWordInput, setBannedWordInput] = useState('');
  const [isBannedWordsLocked, setIsBannedWordsLocked] = useState(true);

  // Hover state for highlighting
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Mobile Sidebar State
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);

  // History & Favorites
  const [promptHistory, setPromptHistory] = useState<PromptSession[]>(() => {
    const saved = localStorage.getItem('scenecraft_library');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [favoriteBlocks, setFavoriteBlocks] = useState<string[]>([]);
  const [showMoreCategory, setShowMoreCategory] = useState<CategoryId | null>(null);
  
  // Save History Modal
  const [showSaveHistoryModal, setShowSaveHistoryModal] = useState(false);
  const [saveHistoryTitle, setSaveHistoryTitle] = useState('');
  const [isGeneratingHistoryTitle, setIsGeneratingHistoryTitle] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryTitle, setEditingHistoryTitle] = useState('');

  // Custom Categories
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customBlocks, setCustomBlocks] = useState<CustomBlock[]>([]);
  const [editingCustomBlock, setEditingCustomBlock] = useState<string | null>(null);
  const [newCustomBlockTitle, setNewCustomBlockTitle] = useState('');
  const [newCustomBlockText, setNewCustomBlockText] = useState('');

  // Flow State
  const [flowStory, setFlowStory] = useState('');
  const [generatedStory, setGeneratedStory] = useState('');
  const [flowCount, setFlowCount] = useState(5);
  const [flowFinalPromptPosition, setFlowFinalPromptPosition] = useState<string>('-');
  const [generatedFlow, setGeneratedFlow] = useState<{title: string, description: string, prompt: string}[]>([]);
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false);

  // Recreation Clean State
  const [showCleanModal, setShowCleanModal] = useState(false);
  const [cleanOptions, setCleanOptions] = useState<string[]>([]);
  const [originalRecreationPrompt, setOriginalRecreationPrompt] = useState<string | null>(null);
  const [isCleaningPrompt, setIsCleaningPrompt] = useState(false);

  // Community State
  const [communityFeed, setCommunityFeed] = useState([
    { id: '1', title: 'Cyberpunk Girl', prompt: 'cyberpunk aesthetic, neon lights, rainy street, 35mm lens', user: 'Mariano43', image: 'https://picsum.photos/seed/cyberpunk/100/100' },
    { id: '2', title: 'Vintage Portrait', prompt: 'vintage polaroid photo, film grain, direct flash photography, casual spontaneous', user: 'AnaPhoto', image: 'https://picsum.photos/seed/vintage/100/100' },
    { id: '3', title: 'Studio Fashion', prompt: 'professional studio, haute couture fashion photography, hard light, 85mm lens', user: 'StudioPro', image: 'https://picsum.photos/seed/studio/100/100' }
  ]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTitle, setShareTitle] = useState('');

  // Coworking State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [coworkingTopics, setCoworkingTopics] = useState<any[]>([]);
  const [activeTopic, setActiveTopic] = useState<any | null>(null);
  const [coworkingMessages, setCoworkingMessages] = useState<any[]>([]);
  const [coworkingInput, setCoworkingInput] = useState('');
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDescription, setNewTopicDescription] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newNewsTitle, setNewNewsTitle] = useState('');
  const [newNewsContent, setNewNewsContent] = useState('');
  const [inviteInput, setInviteInput] = useState('');

  // New Modals State
  const [showAddPromptModal, setShowAddPromptModal] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [showCategoryAndPromptManager, setShowCategoryAndPromptManager] = useState(false);
  const [showEditInstructionModal, setShowEditInstructionModal] = useState(false);
  const [editingInstructionIndex, setEditingInstructionIndex] = useState<number | null>(null);
  const [editingInstructionText, setEditingInstructionText] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'info'
  });

  // Admin State
  const [adminTab, setAdminTab] = useState<'users' | 'news' | 'subs' | 'content'>('users');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState<User | null>(null);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [showConfirmSubModal, setShowConfirmSubModal] = useState(false);
  const [pendingSubChange, setPendingSubChange] = useState<{userId: string, tier: 'free' | 'premium' | 'admin'} | null>(null);
  const [adminConfirmEmail, setAdminConfirmEmail] = useState('');
  const ADMIN_EMAIL = 'wanted123455a@gmail.com';

  // News State
  const [news, setNews] = useState<NewsItem[]>([]);
  const [unreadNewsCount, setUnreadNewsCount] = useState(0);
  const [lastViewedNewsDate, setLastViewedNewsDate] = useState<number>(0);
  const [sharePrompt, setSharePrompt] = useState('');
  const [shareImage, setShareImage] = useState('');
  
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<any | null>(null);

  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState('');

  // Target Model & Prompt Config
  const [targetModel, setTargetModel] = useState<string>('scenecraft');
  const [promptCharLimit, setPromptCharLimit] = useState<number>(2000);
  const [showSettings, setShowSettings] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [uiStyle, setUiStyle] = useState<'modern' | 'glass' | 'brutalist'>('modern');
  const [colorTheme, setColorTheme] = useState<'emerald' | 'blue' | 'purple' | 'rose' | 'amber'>('emerald');
  const [showTutorial, setShowTutorial] = useState(false);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('scenecraft_language') || 'en';
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('scenecraft_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setTheme(settings.theme || 'dark');
      setUiStyle(settings.uiStyle || 'modern');
      setColorTheme(settings.colorTheme || 'emerald');
      setIsNsfwEnabled(settings.isNsfwEnabled || false);
      setPromptCharLimit(settings.promptCharLimit || 2000);
      if (settings.outputLanguage) setOutputLanguage(settings.outputLanguage);
    }
  }, []);
  const LANGUAGES = [
    { code: 'es', name: 'Español' },
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
    { code: 'ko', name: '한국어' },
    { code: 'ru', name: 'Русский' }
  ];

  const translations: Record<string, Record<string, string>> = {
    es: {
      'Visual Result': 'Resultado Visual',
      'Main Focus': 'Enfoque Principal',
      'Scene Type': 'Tipo de Escena',
      'Environment': 'Ambientación',
      'Action / Situation': 'Acción / Situación',
      'Movement': 'Movimiento',
      'Gesticulation': 'Gesticulación',
      'Exposed Parts': 'Partes Expuestas',
      'Camera / Angle': 'Cámara / Ángulo',
      'Lens / Parameters': 'Lentes / Parámetros',
      'Lighting': 'Iluminación',
      'Realism': 'Realismo',
      'Outfit / Styling': 'Outfit / Styling',
      'Makeup': 'Maquillaje',
      'Palette / Color': 'Paleta / Color',
      'Background & Props': 'Fondo y Props',
      'Intention': 'Intención',
      'Body Details': 'Detalles del Cuerpo',
      'Image Qualities': 'Calidades de Imagen',
      'Restrictions': 'Restricciones',
      'My Prompts': 'Mis Prompts',
      'Artistic Style': 'Estilo Artístico',
      'Main Subject': 'Sujeto Principal',
      'Environment / Landscape': 'Entorno / Paisaje',
      'Camera / Composition': 'Cámara / Composición',
      'Atmosphere / Mood': 'Atmósfera / Mood',
      'Color Palette': 'Paleta de Color',
      'Detail Level': 'Nivel de Detalle',
      'Tools': 'Herramientas',
      'Space': 'Espacio',
      'Community': 'Comunidad',
      'Scene': 'Escena',
      'Recreation': 'Recreación',
      'Variations': 'Variaciones',
      'General Prompting': 'Prompting General',
      'Flow': 'Flow',
      'Feed': 'Feed',
      'Co-Working': 'Co-Working',
      'History': 'Historial',
      'Generate Now': 'Generar Ahora',
      'Copied successfully to clipboard': 'Copiado exitosamente en el portapapeles',
      'Search blocks...': 'Buscar bloques...',
      'Select options': 'Selecciona opciones',
      'Custom': 'Personalizado',
      'Banned Words': 'Palabras Prohibidas',
      'Add word': 'Añadir palabra',
      'Locked': 'Bloqueado',
      'Unlocked': 'Desbloqueado',
      'Settings': 'Ajustes',
      'Theme': 'Tema',
      'Dark': 'Oscuro',
      'Light': 'Claro',
      'UI Style': 'Estilo de UI',
      'Modern': 'Moderno',
      'Glass': 'Cristal',
      'Brutalist': 'Brutalista',
      'Color Theme': 'Tema de Color',
      'Prompt Language': 'Idioma del Prompt',
      'Interface Language': 'Idioma de Interfaz',
      'NSFW Content': 'Contenido NSFW',
      'Prompt Character Limit': 'Límite de Caracteres',
      'Close': 'Cerrar',
      'Save': 'Guardar',
      'Cancel': 'Cancelar',
      'Delete': 'Eliminar',
      'Edit': 'Editar',
      'Copy': 'Copiar',
      'Share': 'Compartir',
      'Download': 'Descargar',
      'Upload': 'Subir',
      'Login': 'Iniciar Sesión',
      'Logout': 'Cerrar Sesión',
      'Admin Panel': 'Panel de Admin',
      'Users': 'Usuarios',
      'News': 'Noticias',
      'Subscriptions': 'Suscripciones',
      'Content': 'Contenido',
      'Manual Generation': 'Generación Manual',
      'Auto Generation': 'Generación Automática',
      'Manual': 'Manual',
      'Auto': 'Auto',
      'Compiling...': 'Compilando...',
      'Optimizing...': 'Optimizando...',
      'Generating...': 'Generando...',
      'Success': 'Éxito',
      'Error': 'Error',
      'Warning': 'Advertencia',
      'Confirm': 'Confirmar',
      'Are you sure?': '¿Estás seguro?',
      'This action cannot be undone.': 'Esta acción no se puede deshacer.',
      'Prompt optimized successfully': 'Prompt optimizado con éxito',
      'Failed to optimize prompt': 'Error al optimizar el prompt',
      'No blocks selected': 'No hay bloques seleccionados',
      'Add custom instruction...': 'Añadir instrucción personalizada...',
      'Clear all': 'Limpiar todo',
      'Undo': 'Deshacer',
      'Redo': 'Rehacer',
      'Favorites': 'Favoritos',
      'All': 'Todos',
      'Search...': 'Buscar...',
      'No results found': 'No se encontraron resultados',
      'Loading...': 'Cargando...',
      'Welcome back': 'Bienvenido de nuevo',
      'Please login to save your prompts': 'Por favor, inicia sesión para guardar tus prompts',
      'New Prompt': 'Nuevo Prompt',
      'Title': 'Título',
      'Save Prompt': 'Guardar Prompt',
      'Edit Prompt': 'Editar Prompt',
      'Delete Prompt': 'Eliminar Prompt',
      'Share Prompt': 'Compartir Prompt',
      'Copy to clipboard': 'Copiar al portapapeles',
      'Prompt copied!': '¡Prompt copiado!',
      'View Profile': 'Ver Perfil',
      'My Profile': 'Mi Perfil',
      'Public Feed': 'Feed Público',
      'Trending': 'Tendencias',
      'Recent': 'Recientes',
      'Popular': 'Populares',
      'Follow': 'Seguir',
      'Recycle Bin': 'Papelera de Reciclaje',
      'Empty Bin': 'Vaciar Papelera',
      'Restore': 'Restaurar',
      'Delete Permanently': 'Eliminar Permanentemente',
      'No items in bin': 'No hay elementos en la papelera',
      'Tutorial': 'Tutorial',
      'Skip': 'Saltar',
      'Next': 'Siguiente',
      'Finish': 'Finalizar',
      'Welcome to SceneCraft': 'Bienvenido a SceneCraft',
      'Start building your scene': 'Empieza a construir tu escena',
      'Select categories and blocks': 'Selecciona categorías y bloques',
      'Customize your prompt': 'Personaliza tu prompt',
      'Generate and share': 'Genera y comparte',
      'Influencer Mode': 'Modo Influencer',
      'General Mode': 'Modo General',
      'Switch Mode': 'Cambiar Modo',
      'Category Manager': 'Gestor de Categorías',
      'Add Category': 'Añadir Categoría',
      'Edit Category': 'Editar Categoría',
      'Delete Category': 'Eliminar Categoría',
      'Add Block': 'Añadir Bloque',
      'Edit Block': 'Editar Bloque',
      'Delete Block': 'Eliminar Bloque',
      'Category Name': 'Nombre de la Categoría',
      'Block Title': 'Título del Bloque',
      'Block Value': 'Valor del Bloque',
      'Icon': 'Icono',
      'Color': 'Color',
      'Parent Category': 'Categoría Padre',
      'None': 'Ninguno',
      'Subcategories': 'Subcategorías',
      'Items': 'Elementos',
      'Back': 'Volver',
      'Save Changes': 'Guardar Cambios',
      'Discard': 'Descartar',
      'Are you sure you want to delete this category?': '¿Estás seguro de que quieres eliminar esta categoría?',
      'All blocks inside will also be deleted.': 'Todos los bloques dentro también se eliminarán.',
      'Are you sure you want to delete this folder?': '¿Estás seguro de que quieres eliminar esta carpeta?',
      'The prompts inside will not be deleted, but will lose their association.': 'Los prompts dentro de ella no se eliminarán, pero perderán su asociación.',
      'Are you sure you want to delete this block?': '¿Estás seguro de que quieres eliminar este bloque?',
      'Are you sure you want to delete this prompt?': '¿Estás seguro de que quieres eliminar este prompt?',
      'This cannot be undone.': 'Esto no se puede deshacer.',
      'This action cannot be undone.': 'Esta acción no se puede deshacer.',
      'New Subcategory': 'Nueva Subcategoría',
      'New Item': 'Nuevo Elemento',
      'Edit Instruction': 'Editar Instrucción',
      'Instruction Text': 'Texto de la Instrucción',
      'Banned Word': 'Palabra Prohibida',
      'Add Banned Word': 'Añadir Palabra Prohibida',
      'Enter word...': 'Introduce palabra...',
      'Unlock to edit': 'Desbloquea para editar',
      'Lock': 'Bloquear',
      'Unlock': 'Desbloquear',
      'News & Updates': 'Noticias y Actualizaciones',
      'No news yet': 'No hay noticias aún',
      'Read more': 'Leer más',
      'Mark as read': 'Marcar como leído',
      'Admin': 'Admin',
      'User Detail': 'Detalle de Usuario',
      'Role': 'Rol',
      'Plan': 'Plan',
      'Free Prompts Used': 'Prompts Gratuitos Usados',
      'Subscribed': 'Suscrito',
      'Subscription Tier': 'Nivel de Suscripción',
      'Created At': 'Creado el',
      'Updated At': 'Actualizado el',
      'Change Role': 'Cambiar Rol',
      'Change Tier': 'Cambiar Nivel',
      'Confirm Subscription Change': 'Confirmar Cambio de Suscripción',
      'Please enter the admin email to confirm': 'Por favor, introduce el correo de admin para confirmar',
      'Invalid admin email': 'Correo de admin inválido',
      'Subscription updated successfully': 'Suscripción actualizada con éxito',
      'Failed to update subscription': 'Error al actualizar la suscripción',
      'User updated successfully': 'Usuario actualizado con éxito',
      'Failed to update user': 'Error al actualizar el usuario',
      'News created successfully': 'Noticia creada con éxito',
      'Failed to create news': 'Error al crear la noticia',
      'News deleted successfully': 'Noticia eliminada con éxito',
      'Failed to delete news': 'Error al eliminar la noticia',
      'Category saved successfully': 'Categoría guardada con éxito',
      'Failed to save category': 'Error al guardar la categoría',
      'Category deleted successfully': 'Categoría eliminada con éxito',
      'Failed to delete category': 'Error al eliminar la categoría',
      'Block saved successfully': 'Bloque guardado con éxito',
      'Failed to save block': 'Error al guardar el bloque',
      'Block deleted successfully': 'Bloque eliminado con éxito',
      'Failed to delete block': 'Error al eliminar el bloque',
      'Prompt saved successfully': 'Prompt guardado con éxito',
      'Failed to save prompt': 'Error al guardar el prompt',
      'Prompt deleted successfully': 'Prompt eliminado con éxito',
      'Failed to delete prompt': 'Error al eliminar el prompt',
      'Folder saved successfully': 'Carpeta guardada con éxito',
      'Failed to save folder': 'Error al guardar la carpeta',
      'Folder deleted successfully': 'Carpeta eliminada con éxito',
      'Failed to delete folder': 'Error al eliminar la carpeta',
      'Style saved successfully': 'Estilo guardado con éxito',
      'Failed to save style': 'Error al guardar el estilo',
      'Style deleted successfully': 'Estilo eliminado con éxito',
      'Failed to delete style': 'Error al eliminar el estilo',
      'Topic created successfully': 'Tópico creado con éxito',
      'Failed to create topic': 'Error al crear el tópico',
      'Invitation sent successfully': 'Invitación enviada con éxito',
      'Failed to send invitation': 'Error al enviar la invitación',
      'Message sent successfully': 'Mensaje enviado con éxito',
      'Failed to send message': 'Error al enviar el mensaje',
      'Login successful': 'Inicio de sesión exitoso',
      'Logout successful': 'Cierre de sesión exitoso',
      'Action cancelled': 'Acción cancelada',
      'Optimizar para el límite': 'Optimize for limit',
      'Editing banned words': 'Editando palabras prohibidas',
      'SceneCraft Soul': 'SceneCraft Soul',
      'Midjourney (V6+)': 'Midjourney (V6+)',
      'Stable Diffusion (XL/3)': 'Stable Diffusion (XL/3)',
      'DALL-E 3': 'DALL-E 3',
      'IA Target (Optimización)': 'AI Target (Optimization)',
      'Cambiar a Generación Automática': 'Switch to Auto Generation',
      'Cambiar a Generación Manual': 'Switch to Manual Generation',
      'GENERAR AHORA': 'GENERATE NOW',
      'Resultado Visual': 'Visual Result',
      'Enfoque Principal': 'Main Focus',
      'Tipo de Escena': 'Scene Type',
      'Ambientación': 'Environment',
      'Acción / Situación': 'Action / Situation',
      'Movimiento': 'Movement',
      'Gesticulación': 'Gesticulation',
      'Partes Expuestas': 'Exposed Parts',
      'Cámara / Ángulo': 'Camera / Angle',
      'Lentes / Parámetros': 'Lens / Parameters',
      'Iluminación': 'Lighting',
      'Realismo': 'Realism',
      'Maquillaje': 'Makeup',
      'Paleta / Color': 'Palette / Color',
      'Fondo y Props': 'Background & Props',
      'Intención': 'Intention',
      'Detalles del Cuerpo': 'Body Details',
      'Calidades de Imagen': 'Image Qualities',
      'Restricciones': 'Restrictions',
      'Mis Prompts': 'My Prompts',
      'Estilo Artístico': 'Artistic Style',
      'Sujeto Principal': 'Main Subject',
      'Entorno / Paisaje': 'Environment / Landscape',
      'Cámara / Composición': 'Camera / Composition',
      'Atmósfera / Mood': 'Atmosphere / Mood',
      'Paleta de Color': 'Color Palette',
      'Nivel de Detalle': 'Detail Level',
      'Alchemy History': 'Historial de Alquimia',
      'Prompt Alchemy': 'Alquimia de Prompts',
      'Visual Categories': 'Categorías Visuales',
      'Scene Structure': 'Estructura de la Escena',
      'The generated prompt will appear here...': 'El prompt generado aparecerá aquí...',
      'View More': 'Ver más',
      'Click on the blocks to add them to your prompt.': 'Haz clic en los bloques para añadirlos a tu prompt.',
      'Ex: Make it more casual, change to neon light, add a mirror...': 'Ej: Hazlo más casual, cambia a luz de neón, añade un espejo...',
      'Integrate into Scene': 'Integrar a la Escena',
      'Generating Flow...': 'Generando Flujo...',
      'Generate Story': 'Generar Historia',
      'Community & Inspiration': 'Comunidad e Inspiración',
      'Share to Community': 'Compartir en Comunidad',
      'Comunidad': 'Comunidad',
      'Historial': 'Historial',
      'Herramientas': 'Herramientas',
      'Espacio': 'Espacio',
      'Subs': 'Suscripciones',
      'Cleaning...': 'Limpiando...',
      'Clean': 'Limpiar',
      'Prompt Title:': 'Título del Prompt:',
      'Ex: Cyberpunk Neon Portrait': 'Ej: Retrato Cyberpunk Neón',
      'Prompt (English):': 'Prompt (Inglés):',
      'The prompt you want to share...': 'El prompt que deseas compartir...',
      'Example Image URL (Optional):': 'URL de Imagen de Ejemplo (Opcional):',
      'https://example.com/image.jpg': 'https://ejemplo.com/imagen.jpg',
      'Publish': 'Publicar',
      'Copy Prompt': 'Copiar Prompt',
      'Use Prompt': 'Usar Prompt',
      'Prompt Book': 'Libro de Prompts',
      'This user hasn\'t shared any prompts yet.': 'Este usuario aún no ha compartido prompts.',
      'Create New Topic': 'Crear Nuevo Tema',
      'Ex: Futuristic Project, Rain Session...': 'Ej: Proyecto Futurista, Sesión de Lluvia...',
      'Brief description of what will be discussed...': 'Breve descripción de lo que se discutirá...',
      'Publish News': 'Publicar Noticia',
      'News title...': 'Título de la noticia...',
      'Write the content here...': 'Escribe el contenido aquí...',
      'Invite to Topic': 'Invitar al Tema',
      'Enter email or unique user (Name#1234) to invite.': 'Ingresa el correo electrónico o el usuario único (Nombre#1234) para invitar.',
      'Ex: user@gmail.com or Name#1234': 'Ej: usuario@gmail.com o Nombre#1234',
      'Send Invitation': 'Enviar Invitación',
      'Bust Measurement': 'Medida de Busto',
      'Bust ({size})': 'Busto ({size})',
      'Natural measurement': 'Medida natural',
      'Specify bust measurement or "Bra Cup" for better body consistency.': 'Especifica la medida del busto o "Bra Cup" para mayor consistencia en el cuerpo.',
      'Bra Cup / Measurement': 'Bra Cup / Medida',
      'Ex: 34C, Large, DD cup...': 'Ej: 34C, Large, DD cup...',
      'Smartphone Details': 'Detalles del Celular',
      'What smartphone model would you like to appear in the prompt?': '¿Qué modelo de celular o smartphone te gustaría que aparezca en el prompt?',
      'Smartphone ({model})': 'Celular ({model})',
      'Generic model': 'Modelo genérico',
      'Model / Brand': 'Modelo / Marca',
      'Ex: iPhone 15 Pro Max, Samsung S24 Ultra...': 'Ej: iPhone 15 Pro Max, Samsung S24 Ultra...',
      'Recover accidentally deleted prompts.': 'Recupera prompts eliminados accidentalmente.',
      'The bin is empty': 'La papelera está vacía',
      'Untitled Prompt': 'Prompt sin título',
      'Delete permanently': 'Eliminar permanentemente',
      'Are you sure you want to empty the bin? This action cannot be undone.': '¿Estás seguro de que quieres vaciar la papelera? Esta acción no se puede deshacer.',
      'Restore this prompt': 'Restaurar este prompt',
      'Save this prompt as a reusable style': 'Guarda este prompt como un estilo reutilizable',
      'Ex: Cyberpunk Neon, Realistic Portrait...': 'Ej: Cyberpunk Neon, Retrato Realista...',
      'What do you want to save from this recreation?': '¿Qué deseas guardar de esta recreación?',
      'Everything in General': 'Todo en General',
      'Save the full prompt as a base style.': 'Guarda el prompt completo como un estilo base.',
      'Something Specific': 'Algo Específico',
      'Save only key elements (lights, atmosphere, technique).': 'Guarda solo los elementos clave (luces, atmósfera, técnica).',
      'Detailed Block Management': 'Gestión Detallada de Bloques',
      'There are no elements in the current scene.': 'No hay elementos en la escena actual.',
      'Chat Instruction': 'Instrucción Chat',
      'Clear Scene': 'Limpiar Escena',
      'Add New Prompt': 'Añadir Nuevo Prompt',
      'Save your best creations': 'Guarda tus mejores creaciones',
      'Ex: Cyberpunk Portrait': 'Ej: Retrato Cyberpunk',
      'Prompt Content': 'Contenido del Prompt',
      'Write or paste your prompt here...': 'Escribe o pega tu prompt aquí...',
      'Add Prompt': 'Añadir Prompt',
      'Edit Chat Topic': 'Editar Tópico de Chat',
      'Modify your custom instruction': 'Modifica tu instrucción personalizada',
      'Write your instruction here...': 'Escribe tu instrucción aquí...',
      'Prompt Folders': 'Carpetas de Prompts',
      'All Prompts': 'Todos los Prompts',
      'Base Categories': 'Categorías Base',
      'My Categories': 'Mis Categorías',
      'My Saved Prompts': 'Mis Prompts Guardados',
      'Category Details': 'Detalles de la Categoría',
      'My Custom Categories': 'Mis Categorías Personalizadas',
      'Showing {n} prompts': 'Mostrando {n} prompts',
      'Manage items and subcategories': 'Gestionar elementos y subcategorías',
      'Showing {n} custom categories': 'Mostrando {n} categorías personalizadas',
      'Add Item': 'Añadir Elemento',
      'Add {type}': 'Añadir {type}',
      'Prompt': 'Prompt',
      'Category': 'Categoría',
      'Items / Variants': 'Elementos / Variantes',
      'Base': 'Base',
      'Subcategories / Folders': 'Subcategorías / Carpetas',
      'Top-level category': 'Categoría de nivel superior',
      'e.g. My Style': 'ej. Mi Estilo',
      'Parent Category (Optional)': 'Categoría Padre (Opcional)',
      'None (Top-level)': 'Ninguno (Nivel superior)',
      'Save Category': 'Guardar Categoría',
      'Label': 'Etiqueta',
      'e.g. Cinematic Lighting': 'ej. Iluminación Cinemática',
      'Prompt Text': 'Texto del Prompt',
      'The text that will be added to the prompt...': 'El texto que se añadirá al prompt...',
      'Save Item': 'Guardar Elemento',
      'e.g. Hyper-realistic Portrait': 'ej. Retrato Hiperrealista',
      'Write your prompt here...': 'Escribe tu prompt aquí...',
      'Folder': 'Carpeta',
      'No Folder': 'Sin Carpeta',
      'Delete Folder': 'Eliminar Carpeta',
      'Delete Item': 'Eliminar Elemento',
      'Are you sure you want to delete this item? This action cannot be undone.': '¿Estás seguro de que quieres eliminar este elemento? Esta acción no se puede deshacer.',
      'Manage users, subscriptions and platform content.': 'Gestiona usuarios, suscripciones y contenido de la plataforma.',
      'Total Users': 'Usuarios Totales',
      'User Management': 'Gestión de Usuarios',
      'User': 'Usuario',
      'Status': 'Estado',
      'Prompts': 'Prompts',
      'Actions': 'Acciones',
      'Admin / Creator': 'Admin / Creador',
      'Active': 'Activo',
      'Owner': 'Propietario',
      'Standard User': 'Usuario Estándar',
      'Free': 'Gratis',
      'Gift Subscription': 'Regalar Suscripción',
      'Block User': 'Bloquear Usuario',
      'Free Tier': 'Tier Free',
      'month': 'mes',
      'daily prompts': 'prompts diarios',
      'Basic access': 'Acceso básico',
      'No Magic Enhance': 'Sin Magic Enhance',
      'Configure': 'Configurar',
      'POPULAR': 'POPULAR',
      'Pro Tier': 'Tier Pro',
      'No ads': 'Sin anuncios',
      'Elite Tier': 'Tier Elite',
      'Magic Enhance (AI)': 'Magic Enhance (AI)',
      'Unlimited prompts': 'Prompts ilimitados',
      'Priority support': 'Soporte prioritario',
      'Early access': 'Acceso anticipado',
      'Content Moderation': 'Moderación de Contenido',
      'Platform Controls': 'Controles de Plataforma',
      'Global Maintenance': 'Mantenimiento Global',
      'Blocks access to all users': 'Bloquea el acceso a todos los usuarios',
      'New Features (Spoilers)': 'Nuevas Funciones (Spoilers)',
      'Shows tabs under construction': 'Muestra pestañas en construcción',
      'System Status': 'Estado del Sistema',
      'App Version': 'Versión App',
      'Database': 'Base de Datos',
      'Connected (Firebase)': 'Conectado (Firebase)',
      'Collapse suggestions': 'Contraer sugerencias',
      'Show suggestions': 'Mostrar sugerencias',
      'Copilot': 'Copiloto',
      'Suggestions for your Prompt': 'Sugerencias para tu Prompt',
      'Build your scene to receive contextual suggestions.': 'Construye tu escena para recibir sugerencias contextuales.',
      'Suggestions for your scene': 'Sugerencias para tu escena',
      'No new suggestions for now.': 'No hay nuevas sugerencias por ahora.',
      'Prompt Title': 'Título del Prompt',
      'e.g. Cyberpunk Neon Portrait': 'e.g. Cyberpunk Neon Portrait',
      'Suggest title': 'Sugerir título',
      'My Library': 'Mi Biblioteca',
      'Search in library...': 'Buscar en biblioteca...',
      'Trash': 'Papelera',
      'Date': 'Fecha',
      'You haven\'t saved any prompts yet.': 'No has guardado ningún prompt todavía.',
      'Click to rename': 'Click para renombrar',
      'Reuse': 'Reutilizar',
      'Sensitive Content': 'Contenido Sensible',
      'You are trying to add a block that contains explicit or sensitive material (NSFW).': 'Estás intentando añadir un bloque que contiene material explícito o sensible (NSFW).',
      'To use these blocks, you need to enable the "NSFW Allowed" switch at the top of the workspace.': 'Para poder utilizar estos bloques, necesitas habilitar el interruptor "NSFW Permitido" en la parte superior del área de trabajo.',
      'Understood': 'Entendido',
      'Enable NSFW': 'Habilitar NSFW',
      'Search subcategory...': 'Buscar subcategoría...',
      'Integrate Recreation': 'Integrar Recreación',
      'Current Prompt (Prompting)': 'Prompt Actual (Prompting)',
      'No current prompt...': 'No hay prompt actual...',
      'Extracted Prompt (Recreation)': 'Prompt Extraído (Recreación)',
      'Integration Options': 'Opciones de Integración',
      'Image Recreation': 'Recreación de Imagen',
      'Add (Combine)': 'Añadir (Combinar)',
      'Adds the extracted prompt as a new block in the Scene Structure. The AI will mix it with your current prompt.': 'Añade el prompt extraído como un nuevo bloque en la Estructura de la Escena. La IA lo mezclará con tu prompt actual.',
      'Recreation Details': 'Detalles de Recreación',
      'Use Final Prompt parameters': 'Usar parámetros de Prompt Final',
      'Adds the image as a secondary block. Maintains your current structure and only adds details that do not contradict what you already chose.': 'Añade la imagen como un bloque secundario. Mantiene tu estructura actual y solo añade detalles que no contradicen lo que ya elegiste.',
      'Exact Recreation': 'Recreación Exacta',
      'Use Recreation parameters': 'Usar parámetros de Recreación',
      'Completely replaces your current structure with a single block containing the description of the uploaded image.': 'Reemplaza completamente tu estructura actual con un solo bloque que contiene la descripción de la imagen subida.',
      'Clean Prompt': 'Limpiar Prompt',
      'Select the elements you want to remove from the extracted prompt:': 'Selecciona los elementos que deseas eliminar del prompt extraído:',
      'Tattoos': 'Tatuajes',
      'Piercings': 'Piercings',
      'Hair details (color, style)': 'Detalles del cabello (color, estilo)',
      'Specific facial features': 'Rasgos faciales específicos',
      'Specific clothing': 'Ropa específica',
      'Background / Environment': 'Fondo / Ambientación',
      'Deselect All': 'Deseleccionar Todo',
      'Select All': 'Seleccionar Todo',
      'active elements': 'elementos activos',
      'Hi': 'Hola',
      'Account': 'Cuenta',
      'Connected as': 'Conectado como',
      'Log in to save your progress': 'Inicia sesión para guardar tu progreso',
      'Premium Plan': 'Plan Premium',
      'Free Plan': 'Plan Gratis',
      'Visual Theme': 'Tema Visual',
      'Switch between dark and light mode': 'Cambia entre modo oscuro y claro',
      'Change the application language': 'Cambia el idioma de la aplicación',
      'Output language for generated prompts': 'Idioma de salida para prompts generados',
      'Enable manual editing of the final prompt': 'Habilita la edición manual del prompt final',
      'Preset layouts for the platform': 'Diseños preestablecidos para la plataforma',
      'Modern (Default)': 'Moderno (Por defecto)',
      'Glassmorphism': 'Glassmorphism',
      'Accent Color': 'Color de Acento',
      'Primary color of the interface': 'Color primario de la interfaz',
      'Emerald (Default)': 'Esmeralda (Por defecto)',
      'Blue': 'Azul',
      'Purple': 'Púrpura',
      'Rose': 'Rosa',
      'Amber': 'Ámbar',
      'Save and Apply': 'Guardar y Aplicar',
      'Sign In with Google': 'Iniciar Sesión con Google',
      'Restart Guided Tutorial': 'Reiniciar Tutorial Guiado',
      'Prompts generated in this session. They will be cleared when you close the app.': 'Prompts generados en esta sesión. Se borrarán cuando cierres la aplicación.',
      'No history in this session yet': 'No hay historial en esta sesión todavía',
      'Clear Session History': 'Limpiar Historial de Sesión',
      'Log Out': 'Cerrar Sesión',
      'Categories': 'Categorías',
      'Manage Categories and Prompts': 'Gestionar Categorías y Prompts',
      'Custom Category': 'Categoría Personalizada',
      'Back to top-level category': 'Volver a la categoría superior',
      '(View More)': '(Ver más)',
      'Character limit': 'Límite de caracteres',
      'Code Generation': 'Generación de Código',
      'Drag and drop an image here, or click to select.': 'Arrastra y suelta una imagen aquí, o haz clic para seleccionar.',
      'Paste image URL here...': 'Pega la URL de la imagen aquí...',
      'Generate variations of your current prompt by changing specific aspects.': 'Genera variaciones de tu prompt actual cambiando aspectos específicos.',
      'No current prompt to vary. Go to the Prompting tab and create one.': 'No hay prompt actual para variar. Ve a la pestaña de Prompting y crea uno.',
      'Ex: something dramatic...': 'Ej: algo dramático...',
      'No current prompt. Go to the Prompting tab and create one.': 'No hay prompt actual. Ve a la pestaña de Prompting y crea uno.',
      'Story Configuration': 'Configuración de la Historia',
      'Ex: A heavy day at work, from waking up until returning home exhausted...': 'Ej: Un día pesado en el trabajo, desde que se levanta hasta que regresa a casa exhausto...',
      'Number of prompts (Max 20):': 'Número de prompts (Max 20):',
      'Final Prompt Position:': 'Posición del Prompt Final:',
      'Automatic (Based on coherence)': 'Automático (Según coherencia)',
      'Position': 'Posición',
      'Explore prompts created by other users, get inspired and share your creations.': 'Explora prompts creados por otros usuarios, inspírate y comparte tus creaciones.',
      'Search by title or prompt...': 'Buscar por título o prompt...',
      'Most recent': 'Más recientes',
      'Most popular': 'Más populares',
      'Combine up to 6 images to generate unique and coherent prompts.': 'Combina hasta 6 imágenes para generar prompts únicos y coherentes.',
      'Transmutation Results': 'Resultados de la Transmutación',
      'Variation': 'Variación',
      'No coworking topics yet.': 'No hay temas de coworking aún.',
      'You': 'Tú',
      'Wide field of view, ideal for landscapes or architecture. May distort edges.': 'Amplio campo de visión, ideal para paisajes o arquitectura. Puede distorsionar bordes.',
      'The standard. Very versatile, ideal for half-body portraits and general use.': 'El estándar. Muy versátil, ideal para retratos de medio cuerpo y uso general.',
      'Classic for portraits. Compresses the background and favors facial features.': 'Clásico para retratos. Comprime el fondo y favorece las facciones del rostro.',
      'Captures a lot of information from the environment. Useful in closed spaces.': 'Captura mucha información del entorno. Útil en espacios cerrados.',
      'Specific lens effect to alter the image aesthetics.': 'Efecto de lente específico para alterar la estética de la imagen.',
      'Natural perspective, similar to human vision. Excellent for reportage and street.': 'Perspectiva natural, similar a la vista humana. Excelente para reportajes y calle.',
      'Brings distant objects closer and compresses perspective significantly. Very blurred background.': 'Acerca objetos lejanos y comprime mucho la perspectiva. Fondo muy desenfocado.',
      'Natural smartphone style, great depth of field, visible digital processing.': 'Estilo natural de smartphone, gran profundidad de campo, procesamiento digital visible.',
      'Ocurrió un error al generar los prompts. Por favor, intenta de nuevo.': 'An error occurred while generating the prompts. Please try again.',
      'Please upload at least one image.': 'Por favor, sube al menos una imagen.',
      '¡Invitación recibida! {inviter} te ha invitado al tema: {topicTitle}': 'Invitation received! {inviter} has invited you to the topic: {topicTitle}',
      'Celular ({model})': 'Smartphone ({model})',
      'Generic model': 'Modelo genérico',
      'Select File': 'Seleccionar Archivo',
      'Or use a link': 'O usa un enlace',
      'Load URL': 'Cargar URL',
      'Got it': 'Entendido',
      'Undo': 'Deshacer',
      'More options': 'Más opciones',
      'Account Settings': 'Ajustes de cuenta',
      'Herramientas': 'Herramientas',
      'Comunidad': 'Comunidad',
      'Escena': 'Escena',
      'Prompting General': 'Prompting General',
      'Recreación': 'Recreación',
      'Variaciones': 'Variaciones',
      'Flow': 'Flow',
      'Alquimia': 'Alquimia',
      'Feed': 'Feed',
      'Co-Working': 'Co-Working',
      'Wide field of view, ideal for landscapes or architecture. May distort edges.': 'Campo de visión amplio, ideal para paisajes o arquitectura. Puede distorsionar los bordes.',
      'Natural perspective, similar to human vision. Excellent for reportage and street.': 'Perspectiva natural, similar a la visión humana. Excelente para reportajes y calle.',
      'The standard. Very versatile, ideal for half-body portraits and general use.': 'El estándar. Muy versátil, ideal para retratos de medio cuerpo y uso general.',
      'Classic for portraits. Compresses the background and favors facial features.': 'Clásico para retratos. Comprime el fondo y favorece los rasgos faciales.',
      'Brings distant objects closer and compresses perspective significantly. Very blurred background.': 'Acerca objetos distantes y comprime la perspectiva significativamente. Fondo muy desenfocado.',
      'Captures a lot of information from the environment. Useful in closed spaces.': 'Captura mucha información del entorno. Útil en espacios cerrados.',
      'Natural smartphone style, great depth of field, visible digital processing.': 'Estilo natural de smartphone, gran profundidad de campo, procesamiento digital visible.',
      'Specific lens effect to alter the image aesthetics.': 'Efecto de lente específico para alterar la estética de la imagen.',
      'Visual Categories': 'Categorías Visuales',
      'Manage Categories and Prompts': 'Gestionar Categorías y Prompts',
      'Custom Category': 'Categoría Personalizada',
      'Click on the blocks to add them to your prompt.': 'Haz clic en los bloques para añadirlos a tu prompt.',
      'Subcategories': 'Subcategorías',
      'No items in this category': 'No hay elementos en esta categoría',
      'Back to top-level category': 'Volver a la categoría principal',
      '(View More)': '(Ver más)',
      'Filter...': 'Filtrar...',
      'Expand structure': 'Expandir estructura',
      'Collapse structure': 'Contraer estructura',
      'Expand': 'Expandir',
      'Collapse': 'Contraer',
      'Manage': 'Gestionar',
      'Select blocks on the left or ask something in the chat to start.': 'Selecciona bloques a la izquierda o pregunta algo en el chat para empezar.',
      'Custom': 'Personalizado',
      // Category Labels from constants.ts
      'Visual Result': 'Resultado Visual',
      'Main Focus': 'Enfoque Principal',
      'Scene Type': 'Tipo de Escena',
      'Environment': 'Entorno',
      'Action / Situation': 'Acción / Situación',
      'Movement': 'Movimiento',
      'Gesticulation': 'Gesticulación',
      'Exposed Parts': 'Partes Expuestas',
      'Camera / Angle': 'Cámara / Ángulo',
      'Lens / Parameters': 'Lente / Parámetros',
      'Lighting': 'Iluminación',
      'Realism': 'Realismo',
      'Outfit / Styling': 'Atuendo / Estilo',
      'Makeup': 'Maquillaje',
      'Palette / Color': 'Paleta / Color',
      'Background & Props': 'Fondo y Accesorios',
      'Intention': 'Intención',
      'Body Details': 'Detalles del Cuerpo',
      'Image Qualities': 'Calidades de Imagen',
      'Restrictions': 'Restricciones',
      'My Prompts': 'Mis Prompts',
      'Artistic Style': 'Estilo Artístico',
      'Main Subject': 'Sujeto Principal',
      'Environment / Landscape': 'Entorno / Paisaje',
      'Camera / Composition': 'Cámara / Composición',
      'Atmosphere / Mood': 'Atmósfera / Estado de ánimo',
      'Color Palette': 'Paleta de Colores',
      'Detail Level': 'Nivel de Detalle',
      // Influencer Blocks - Visual Result
      'Casual spontaneous': 'Casual espontáneo',
      'Natural selfie': 'Selfie natural',
      'Magazine editorial': 'Editorial de revista',
      'Professional studio': 'Estudio profesional',
      'Cinematic': 'Cinematográfico',
      'Aesthetic': 'Estético',
      'Film grain': 'Grano de película',
      'Product commercial': 'Comercial de producto',
      'Intimate portrait': 'Retrato íntimo',
      'Urban lifestyle': 'Estilo de vida urbano',
      'Vintage polaroid': 'Polaroid vintage',
      'Disposable camera': 'Cámara desechable',
      'Street photography': 'Fotografía callejera',
      'Haute couture': 'Alta costura',
      'Dark fantasy': 'Fantasía oscura',
      // Main Focus
      'Selfie': 'Selfie',
      'Face focus': 'Enfoque en la cara',
      'Feet focus': 'Enfoque en los pies',
      'Neck focus': 'Enfoque en el cuello',
      'Environment focus': 'Enfoque en el entorno',
      'Gesture focus': 'Enfoque en el gesto',
      'Background interaction': 'Interacción con el fondo',
      'Lips focus': 'Enfoque en los labios',
      'Eyes focus': 'Enfoque en los ojos',
      'Hands focus': 'Enfoque en las manos',
      'Silhouette focus': 'Enfoque en la silueta',
      // Scene Type
      'In bedroom': 'En el dormitorio',
      'In bed': 'En la cama',
      'In kitchen': 'En la cocina',
      'On the street': 'En la calle',
      'At a concert': 'En un concierto',
      'At school': 'En la escuela',
      'Solid background': 'Fondo sólido',
      'Contrast background': 'Fondo de contraste',
      'Warm interior': 'Interior cálido',
      'Everyday exterior': 'Exterior cotidiano',
      'At the beach': 'En la playa',
      'In the forest': 'En el bosque',
      'In a cafe': 'En una cafetería',
      'At the gym': 'En el gimnasio',
      'In a bar': 'En un bar',
      'On public transport': 'En transporte público',
      'In a botanical garden': 'En un jardín botánico',
      'In an old library': 'En una biblioteca antigua',
      'On a rooftop': 'En una azotea',
      'In an art studio': 'En un estudio de arte',
      'In a shopping mall': 'En un centro comercial',
      'At an amusement park': 'En un parque de atracciones',
      'On a balcony': 'En un balcón',
      'In an elevator': 'En un ascensor',
      // Environment
      'Dawn': 'Amanecer',
      'Day': 'Día',
      'Afternoon': 'Tarde',
      'Night': 'Noche',
      'Indoor variations': 'Variaciones de interior',
      'Rainy': 'Lluvioso',
      'Cloudy': 'Nublado',
      'Snowy': 'Nevado',
      'Dense fog': 'Niebla densa',
      'Thunderstorm': 'Tormenta eléctrica',
      'Purple sunset': 'Atardecer púrpura',
      'Morning mist light': 'Luz de niebla matutina',
      'Sweltering heat': 'Calor sofocante',
      'Strong wind': 'Viento fuerte',
      // Action / Situation
      'Walking': 'Caminando',
      'Posing alone': 'Posando sola',
      'Eating': 'Comiendo',
      'Hanging out with friends': 'Pasando el rato con amigos',
      'Taking selfie': 'Tomando selfie',
      'Showing product': 'Mostrando producto',
      'Sitting resting': 'Sentada descansando',
      'Interacting with object': 'Interactuando con objeto',
      'Candid moment': 'Momento espontáneo',
      'Dancing': 'Bailando',
      'Reading a book': 'Leyendo un libro',
      'Drinking coffee': 'Bebiendo café',
      'Looking at phone': 'Mirando el teléfono',
      'Adjusting hair': 'Ajustándose el pelo',
      'Working out': 'Haciendo ejercicio',
      'Listening to music': 'Escuchando música',
      'Painting/Drawing': 'Pintando/Dibujando',
      'Cooking': 'Cocinando',
      'Talking on phone': 'Hablando por teléfono',
      'Meditating': 'Meditando',
      'Taking photos': 'Tomando fotos',
      'Waiting for bus': 'Esperando el autobús',
      'Applying makeup': 'Aplicándose maquillaje',
      'Whispering': 'Susurrando',
      // Movement
      'Completely still': 'Completamente quieta',
      'Walking (motion)': 'Caminando (movimiento)',
      'Slight motion blur': 'Ligero desenfoque de movimiento',
      'Heavy motion (running)': 'Movimiento pesado (corriendo)',
      'Rotating angle': 'Ángulo de rotación',
      'Zoom in/out': 'Zoom in/out',
      'Light trails (night)': 'Estelas de luz (noche)',
      'Hair in the wind': 'Pelo al viento',
      'Clothes fluttering': 'Ropa ondeando',
      'Jumping': 'Saltando',
      'Free fall': 'Caída libre',
      'Quick spin': 'Giro rápido',
      // Gesticulation
      'Matching expression': 'Expresión acorde',
      'Believable hands': 'Manos creíbles',
      'Natural posture': 'Postura natural',
      'Looking at camera': 'Mirando a cámara',
      'Looking away': 'Mirando hacia otro lado',
      'Wide smile': 'Sonrisa amplia',
      'Serious expression': 'Expresión seria',
      'Wink': 'Guiño',
      'Biting lip': 'Mordiéndose el labio',
      'Surprise': 'Sorpresa',
      'Subtle anger': 'Enojo sutil',
      'Melancholic sadness': 'Tristeza melancólica',
      'Uncontrollable laughter': 'Risa incontrolable',
      'Boredom': 'Aburrimiento',
      'Seduction': 'Seducción',
      'Concentration': 'Concentración',
      // Exposed Parts
      'Visible arms': 'Brazos visibles',
      'Abdomen (crop top)': 'Abdomen (crop top)',
      'Visible legs': 'Piernas visibles',
      'Visible thighs': 'Muslos visibles',
      'Visible feet': 'Pies visibles',
      'Visible hands': 'Manos visibles',
      'Visible back': 'Espalda visible',
      'Visible knees': 'Rodillas visibles',
      'Visible shoulders': 'Hombros visibles',
      'Visible elbows': 'Codos visibles',
      'Visible neck': 'Cuello visible',
      'Topless': 'Topless',
      'Bottomless': 'Bottomless',
      'Full nudity': 'Nude completo',
      'Visible nipples': 'Pezones visibles',
      'Visible vagina': 'Vagina visible',
      'Visible penis': 'Pene visible',
      'Exposed buttocks': 'Glúteos expuestos',
      // Camera / Angle
      'Close up': 'Primer plano',
      'Medium shot': 'Plano medio',
      'Full body': 'Cuerpo completo',
      'High angle': 'Ángulo alto (Picado)',
      'Low angle': 'Ángulo bajo (Contrapicado)',
      'Selfie angle': 'Ángulo de selfie',
      'Side angle': 'Ángulo lateral',
      'Centered composition': 'Composición centrada',
      'Paparazzi style': 'Estilo paparazzi',
      'Bird\'s eye view': 'Vista de pájaro',
      'Worm\'s eye view': 'Vista de gusano',
      'Dutch angle': 'Ángulo holandés',
      'Detail shot': 'Plano de detalle',
      'From behind': 'Desde atrás',
      'Over the shoulder': 'Sobre el hombro',
      'Extreme wide shot': 'Gran plano general',
      // Lenses / Parameters
      '24mm': '24mm',
      '35mm': '35mm',
      '50mm': '50mm',
      '85mm': '85mm',
      'Telephoto': 'Teleobjetivo',
      'Wide angle': 'Gran angular',
      'f/1.8': 'f/1.8',
      'Blurred background': 'Fondo desenfocado (Bokeh)',
      'Studio sharpness': 'Nitidez de estudio',
      'Fisheye': 'Ojo de pez',
      'Anamorphic lens': 'Lente anamórfica',
      'iPhone camera': 'Cámara de iPhone',
      'Macro lens': 'Lente macro',
      'Vintage filter': 'Filtro vintage',
      // Lighting
      'Natural light': 'Luz natural',
      'Window light': 'Luz de ventana',
      'Golden hour': 'Hora dorada',
      'Artificial light': 'Luz artificial',
      'Hard light': 'Luz dura',
      'Soft light': 'Luz suave',
      'Color neon': 'Neón de color',
      'Backlighting': 'Contraluz',
      'Editorial lighting': 'Iluminación editorial',
      'Moonlight': 'Luz de luna',
      'Candlelight': 'Luz de vela',
      'Direct flash': 'Flash directo',
      'Dramatic lighting': 'Iluminación dramática',
      'Disco light': 'Luz de discoteca',
      'Sunset light': 'Luz de atardecer',
      'Volumetric light': 'Luz volumétrica',
      // Realism
      'Visible pores': 'Poros visibles',
      'Natural texture': 'Textura natural',
      'Micro-imperfections': 'Micro-imperfecciones',
      'Subtle wrinkles': 'Arrugas sutiles',
      'Real hair': 'Pelo real',
      'Fabric folds': 'Pliegues de tela',
      'Natural shadows': 'Sombras naturales',
      'Realistic skin (body)': 'Piel realista (cuerpo)',
      'Freckles and moles': 'Pecas y lunares',
      'Light sweat': 'Sudor ligero',
      'Subtle body hair': 'Vello corporal sutil',
      'Subtle scars': 'Cicatrices sutiles',
      'Visible veins': 'Venas visibles',
      // Outfit / Styling
      'Dark outfit': 'Atuendo oscuro',
      'Streetwear': 'Streetwear',
      'Casual': 'Casual',
      'Elegant': 'Elegante',
      'Minimalist': 'Minimalista',
      'Black crop top': 'Crop top negro',
      'Dress': 'Vestido',
      'Tattoos': 'Tatuajes',
      'Dark makeup': 'Maquillaje oscuro',
      'Sportswear': 'Ropa deportiva',
      'Swimsuit': 'Traje de baño',
      'Lingerie': 'Lencería',
      'Winter clothing': 'Ropa de invierno',
      'Sunglasses': 'Gafas de sol',
      'Transparent clothing': 'Ropa transparente',
      'Gothic style': 'Estilo gótico',
      'Leather clothing': 'Ropa de cuero',
      'School uniform': 'Uniforme escolar',
      'Pajamas': 'Pijama',
      'Silk clothing': 'Ropa de seda',
      // Makeup
      'Natural / No-makeup': 'Natural / Sin maquillaje',
      'E-girl': 'E-girl',
      'Gloss only': 'Solo brillo',
      'Graphic eyeliner': 'Delineado gráfico',
      'Smokey eye': 'Ojo ahumado',
      'Red lips': 'Labios rojos',
      'Drag makeup': 'Maquillaje drag',
      'Faux freckles': 'Pecas falsas',
      'Neon eyeshadow': 'Sombra de ojos neón',
      'Soft glam': 'Glamour suave',
      'Euphoria style': 'Estilo Euphoria',
      'Fantasy makeup': 'Maquillaje de fantasía',
      // Palette / Color
      'Neutrals': 'Neutrales',
      'Darks': 'Oscuros',
      'Warms': 'Cálidos',
      'Colds': 'Fríos',
      'Monochromatic': 'Monocromático',
      'High contrast': 'Alto contraste',
      'Red accents': 'Acentos rojos',
      'Total black': 'Todo negro',
      'Pastel tones': 'Tonos pastel',
      'Black and white': 'Blanco y negro',
      'High saturation': 'Alta saturación',
      'Earth tones': 'Tonos tierra',
      'Gold and black': 'Oro y negro',
      'Electric blue': 'Azul eléctrico',
      // Background and Props
      'Circular rug': 'Alfombra circular',
      'Mirror': 'Espejo',
      'Posters': 'Pósteres',
      'Messy bed': 'Cama desordenada',
      'Warm lamp': 'Lámpara cálida',
      'Smartphone': 'Smartphone',
      'Props': 'Accesorios',
      'Indoor plants': 'Plantas de interior',
      'Coffee mug': 'Taza de café',
      'Stacked books': 'Libros apilados',
      'Musical instrument': 'Instrumento musical',
      'Sports car': 'Coche deportivo',
      'Open laptop': 'Portátil abierto',
      'Large headphones': 'Auriculares grandes',
      'Vintage camera': 'Cámara vintage',
      'Pet (dog/cat)': 'Mascota (perro/gato)',
      'Fast food': 'Comida rápida',
      'Energy drink': 'Bebida energética',
      'Backpack': 'Mochila',
      'Skateboard': 'Monopatín',
      // Intention
      'For social media': 'Para redes sociales',
      'For brand': 'Para marca',
      'Casual campaign': 'Campaña casual',
      'Aspirational image': 'Imagen aspiracional',
      'Lookbook': 'Lookbook',
      'Documentary photography': 'Fotografía documental',
      'Conceptual art': 'Arte conceptual',
      'Movie poster': 'Póster de película',
      // Body Details
      'Height: Tall': 'Altura: Alta',
      'Height: Average': 'Altura: Promedio',
      'Height: Short': 'Altura: Baja',
      'Long legs': 'Piernas largas',
      'Bust size': 'Tamaño de busto',
      'Porcelain skin': 'Piel de porcelana',
      'Moisturized skin': 'Piel hidratada',
      'Dry skin': 'Piel seca',
      'Natural/Healthy skin': 'Piel natural/saludable',
      'Natural redness (Feet)': 'Enrojecimiento natural (Pies)',
      'Natural redness (Knees)': 'Enrojecimiento natural (Rodillas)',
      'Natural redness (Cheeks)': 'Enrojecimiento natural (Mejillas)',
      'Birthmark detail': 'Detalle de marca de nacimiento',
      'Tanned skin': 'Piel bronceada',
      'Freckled skin (body)': 'Piel con pecas (cuerpo)',
      'Athletic build': 'Constitución atlética',
      'Slender build': 'Constitución esbelta',
      'Curvy build': 'Constitución con curvas',
      'Pale skin': 'Piel pálida',
      'Brown skin': 'Piel morena',
      'Dark skin': 'Piel oscura',
      'Subtle veins': 'Venas sutiles',
      'Body: Hourglass': 'Cuerpo: Reloj de arena',
      'Body: Pear': 'Cuerpo: Pera',
      'Body: Rectangular': 'Cuerpo: Rectangular',
      'Legs: Muscular': 'Piernas: Musculosas',
      'Legs: Slender': 'Piernas: Esbeltas',
      'Feet: High arches': 'Pies: Arcos altos',
      'Feet: Painted nails': 'Pies: Uñas pintadas',
      'Feet: Pinkish soles': 'Pies: Plantas rosadas',
      'Detail: Prominent collarbones': 'Detalle: Clavículas prominentes',
      'Detail: Defined back': 'Detalle: Espalda definida',
      'Detail: Delicate hands': 'Detalle: Manos delicadas',
      'Detail: Long neck': 'Detalle: Cuello largo',
      'Skin: Subtle body hair': 'Piel: Vello corporal sutil',
      'Skin: Stretch marks': 'Piel: Estrías',
      'Skin: Cellulite': 'Piel: Celulitis',
      // Image Quality
      'Low Quality': 'Baja Calidad',
      'Medium Quality': 'Calidad Media',
      'High Quality': 'Alta Calidad',
      '4K': '4K',
      '8K': '8K',
      'Perfect Plastic Skin': 'Piel de plástico perfecta',
      'Realistic HD': 'HD Realista',
      'Raw Photo': 'Foto Raw',
      // Restrictions / Negatives
      'Avoid deformed hands': 'Evitar manos deformes',
      'Avoid overprocessed look': 'Evitar aspecto sobreprocesado',
      'Avoid plastic skin': 'Evitar piel de plástico',
      'Avoid impossible poses': 'Evitar poses imposibles',
      'Avoid empty expressions': 'Evitar expresiones vacías',
      'Avoid text': 'Evitar texto',
      'Avoid facial asymmetry': 'Evitar asimetría facial',
      'Avoid censorship': 'Evitar censura',
      // General Blocks - Artistic Style
      'Realistic Photography': 'Fotografía Realista',
      'Digital Illustration': 'Ilustración Digital',
      'Oil Painting': 'Pintura al Óleo',
      'Concept Art': 'Arte de Concepto',
      'Cyberpunk': 'Cyberpunk',
      'Steampunk': 'Steampunk',
      'Watercolor': 'Acuarela',
      'Anime / Manga': 'Anime / Manga',
      'Low Poly / 3D': 'Low Poly / 3D',
      // Main Subject
      'Modern Architecture': 'Arquitectura Moderna',
      'Futuristic Vehicle': 'Vehículo Futurista',
      'Fantastic Creature': 'Criatura Fantástica',
      'Everyday Object': 'Objeto Cotidiano',
      'Food / Drink': 'Comida / Bebida',
      'Ancient Ruins': 'Ruinas Antiguas',
      'Spaceship': 'Nave Espacial',
      // Environment / Landscape
      'Futuristic City': 'Ciudad Futurista',
      'Magical Forest': 'Bosque Mágico',
      'Desert': 'Desierto',
      'Snowy Mountains': 'Montañas Nevadas',
      'Underwater Background': 'Fondo Subacuático',
      'Outer Space': 'Espacio Exterior',
      'Cozy Interior': 'Interior Acogedor',
      // Lighting
      'Natural Light (Day)': 'Luz Natural (Día)',
      'Golden Hour': 'Hora Dorada',
      'Studio Lighting': 'Iluminación de Estudio',
      'Neon Light': 'Luz de Neón',
      'Moonlight': 'Luz de Luna',
      'Volumetric Light': 'Luz Volumétrica',
      'Low Key Lighting': 'Iluminación en Clave Baja',
      // Camera / Composition
      'Wide Shot': 'Plano General',
      'Close Up': 'Primer Plano',
      'Bird\'s Eye View': 'Vista de Pájaro',
      'Worm\'s Eye View': 'Vista de Gusano',
      'Symmetry': 'Simetría',
      'Rule of Thirds': 'Regla de los Tercios',
      'Depth of Field': 'Profundidad de Campo',
      // Atmosphere / Mood
      'Epic / Majestic': 'Épico / Majestuoso',
      'Mysterious / Dark': 'Misterioso / Oscuro',
      'Quiet / Peaceful': 'Tranquilo / Pacífico',
      'Chaotic / Dynamic': 'Caótico / Dinámico',
      'Melancholic': 'Melancólico',
      'Cheerful / Vibrant': 'Alegre / Vibrante',
      // Color Palette
      'Pastel Colors': 'Colores Pastel',
      'Black and White': 'Blanco y Negro',
      'Warm Tones': 'Tonos Cálidos',
      'Cool Tones': 'Tonos Fríos',
      'High Contrast': 'Alto Contraste',
      'Earth Tones': 'Tonos Tierra',
      // Detail Level
      'Ultra Detailed': 'Ultra Detallado',
      'Minimalist': 'Minimalista',
      'Abstract': 'Abstracto',
      'Textured': 'Texturizado',
      // Image Qualities (General)
      'Low Quality': 'Baja Calidad',
      'Medium Quality': 'Calidad Media',
      'High Quality': 'Alta Calidad',
      '4K': '4K',
      '8K': '8K',
      'Perfect Plastic Skin': 'Piel de Plástico Perfecta',
      'Masterpiece': 'Obra Maestra',
      'HDR': 'HDR',
      // Category and Prompt Manager
      'Content Manager': 'Gestor de Contenido',
      'Prompts': 'Prompts',
      'Categories': 'Categorías',
      'Search...': 'Buscar...',
      'Prompt Folders': 'Carpetas de Prompts',
      'New Folder': 'Nueva Carpeta',
      'All Prompts': 'Todos los Prompts',
      'Base Categories': 'Categorías Base',
      'My Categories': 'Mis Categorías',
      'My Saved Prompts': 'Mis Prompts Guardados',
      'Category Details': 'Detalles de la Categoría',
      'My Custom Categories': 'Mis Categorías Personalizadas',
      'Showing {n} prompts': 'Mostrando {n} prompts',
      'Manage items and subcategories': 'Gestionar elementos y subcategorías',
      'Showing {n} custom categories': 'Mostrando {n} categorías personalizadas',
      'Add Item': 'Añadir Elemento',
      'Add {type}': 'Añadir {type}',
      'Items / Variants': 'Elementos / Variantes',
      'Base': 'Base',
      'Subcategories / Folders': 'Subcategorías / Carpetas',
      'New Subcategory': 'Nueva Subcategoría',
      'Top-level category': 'Categoría de nivel superior',
      'Edit Category': 'Editar Categoría',
      'Add Category': 'Añadir Categoría',
      'Name': 'Nombre',
      'e.g. My Style': 'ej. Mi Estilo',
      'Parent Category (Optional)': 'Categoría Padre (Opcional)',
      'None (Top-level)': 'Ninguna (Nivel superior)',
      'Icon': 'Icono',
      'Save Category': 'Guardar Categoría',
      'Edit Item': 'Editar Elemento',
      'Label': 'Etiqueta',
      'e.g. Cinematic Lighting': 'ej. Iluminación Cinematográfica',
      'Prompt Text': 'Texto del Prompt',
      'The text that will be added to the prompt...': 'El texto que se añadirá al prompt...',
      'Mark if this item contains adult content': 'Marcar si este elemento contiene contenido para adultos',
      'Save Item': 'Guardar Elemento',
      'Edit Prompt': 'Editar Prompt',
      'Add Prompt': 'Añadir Prompt',
      'e.g. Hyper-realistic Portrait': 'ej. Retrato Hiperrealista',
      'Content': 'Contenido',
      'Write your prompt here...': 'Escribe tu prompt aquí...',
      'Folder': 'Carpeta',
      'No Folder': 'Sin Carpeta',
      'Save Prompt': 'Guardar Prompt',
      'Delete Category': 'Eliminar Categoría',
      'Delete Folder': 'Eliminar Carpeta',
      'Delete Prompt': 'Eliminar Prompt',
      'Delete Item': 'Eliminar Elemento',
      'Are you sure you want to delete this category?': '¿Estás seguro de que quieres eliminar esta categoría?',
      'All blocks inside will also be deleted.': 'Todos los bloques en su interior también serán eliminados.',
      'Are you sure you want to delete this folder?': '¿Estás seguro de que quieres eliminar esta carpeta?',
      'The prompts inside will not be deleted, but will lose their association.': 'Los prompts en su interior no serán eliminados, pero perderán su asociación.',
      'Are you sure you want to delete this item?': '¿Estás seguro de que quieres eliminar este elemento?',
      'This action cannot be undone.': 'Esta acción no se puede deshacer.',
      'Are you sure you want to delete this prompt?': '¿Estás seguro de que quieres eliminar este prompt?',
      'Title': 'Título',
      'NSFW Content': 'Contenido NSFW',
      'Cancel': 'Cancelar',
      'Prompt': 'Prompt',
      'Category': 'Categoría',
      'Custom': 'Personalizado',
      'Invitation received! {inviter} invited you to the topic: {topicTitle}': '¡Invitación recibida! {inviter} te ha invitado al tema: {topicTitle}',
      'Copied successfully to clipboard': 'Copiado exitosamente en el portapapeles',
      'Please upload at least one image.': 'Por favor, sube al menos una imagen.',
      'An error occurred while generating prompts. Please try again.': 'Ocurrió un error al generar los prompts. Por favor, intenta de nuevo.',
      'Prompt {n}': 'Prompt {n}',
      'Could not extract prompt from image.': 'No se pudo extraer el prompt de la imagen.',
      'An error occurred while analyzing the image.': 'Ocurrió un error al analizar la imagen.',
      'Personalize your SceneCraft AI experience': 'Personaliza tu experiencia en SceneCraft AI',
      'Hi': 'Hola',
      'Account': 'Cuenta',
      'Connected as': 'Conectado como',
      'Log in to save your progress': 'Inicia sesión para guardar tu progreso',
      'Premium Plan': 'Plan Premium',
      'Free Plan': 'Plan Gratuito',
      'Log Out': 'Cerrar Sesión',
      'Visual Theme': 'Tema Visual',
      'Switch between dark and light mode': 'Cambiar entre modo oscuro y claro',
      'Dark': 'Oscuro',
      'Light': 'Claro',
      'Allow explicit blocks and terms': 'Permitir bloques y términos explícitos',
      'Interface Language': 'Idioma de la Interfaz',
      'Change the application language': 'Cambiar el idioma de la aplicación',
      'Prompt Language': 'Idioma del Prompt',
      'Output language for generated prompts': 'Idioma de salida para los prompts generados',
      'Manual Generation': 'Generación Manual',
      'Enable manual editing of the final prompt': 'Habilitar edición manual del prompt final',
      'UI Style': 'Estilo de UI',
      'Preset layouts for the platform': 'Diseños preestablecidos para la plataforma',
      'Modern (Default)': 'Moderno (Predeterminado)',
      'Glassmorphism': 'Glassmorphism',
      'Brutalist': 'Brutalista',
      'Accent Color': 'Color de Acento',
      'Primary color of the interface': 'Color primario de la interfaz',
      'Emerald (Default)': 'Esmeralda (Predeterminado)',
      'Blue': 'Azul',
      'Purple': 'Púrpura',
      'Rose': 'Rosa',
      'Amber': 'Ámbar',
      'Save and Apply': 'Guardar y Aplicar',
      'Sign In with Google': 'Iniciar Sesión con Google',
      'Save': 'Guardar',
      'My Library': 'Mi Biblioteca',
      'Account Settings': 'Ajustes de Cuenta',
      'Admin Panel': 'Panel de Administración',
      'Admin': 'Admin',
      'Wide field of view, ideal for landscapes or architecture. May distort edges.': 'Campo de visión amplio, ideal para paisajes o arquitectura. Puede distorsionar los bordes.',
      'Natural perspective, similar to human vision. Excellent for reportage and street.': 'Perspectiva natural, similar a la visión humana. Excelente para reportajes y calle.',
      'The standard. Very versatile, ideal for half-body portraits and general use.': 'El estándar. Muy versátil, ideal para retratos de medio cuerpo y uso general.',
      'Classic for portraits. Compresses the background and favors facial features.': 'Clásico para retratos. Comprime el fondo y favorece los rasgos faciales.',
      'Brings distant objects closer and compresses perspective significantly. Very blurred background.': 'Acerca los objetos distantes y comprime significativamente la perspectiva. Fondo muy desenfocado.',
      'Captures a lot of information from the environment. Useful in closed spaces.': 'Captura mucha información del entorno. Útil en espacios cerrados.',
      'Natural smartphone style, great depth of field, visible digital processing.': 'Estilo natural de smartphone, gran profundidad de campo, procesamiento digital visible.',
      'Specific lens effect to alter the image aesthetics.': 'Efecto de lente específico para alterar la estética de la imagen.',
      'Visual Categories': 'Categorías Visuales',
      'Manage Categories and Prompts': 'Gestionar Categorías y Prompts',
      'Custom Category': 'Categoría Personalizada',
      'Click on the blocks to add them to your prompt.': 'Haz clic en los bloques para añadirlos a tu prompt.',
      'Subcategories': 'Subcategorías',
      'Items': 'Elementos',
      'Manage': 'Gestionar',
      'No items in this category': 'No hay elementos en esta categoría',
      'Back to top-level category': 'Volver a la categoría principal',
      '(View More)': '(Ver más)',
      'Filter...': 'Filtrar...',
      'NEWS:': 'NOTICIAS:',
      'Scene Structure': 'Estructura de la Escena',
      'Expand structure': 'Expandir estructura',
      'Collapse structure': 'Contraer estructura',
      'Expand': 'Expandir',
      'Collapse': 'Contraer',
      'Select blocks on the left or ask something in the chat to start.': 'Selecciona bloques a la izquierda o pregunta algo en el chat para comenzar.',
      'Prompt Final': 'Prompt Final',
      'Magic Enhance (AI)': 'Mejora Mágica (IA)',
      'Limit': 'Límite',
      'Character limit': 'Límite de caracteres',
      'Optimize for limit': 'Optimizar para el límite',
      'GENERATE NOW': 'GENERAR AHORA',
      'Editing banned words': 'Editando palabras prohibidas',
      'Compiling...': 'Compilando...',
      'Switch to Auto Generation': 'Cambiar a Generación Automática',
      'Switch to Manual Generation': 'Cambiar a Generación Manual',
      'Manual': 'Manual',
      'Auto': 'Auto',
      'AI Target (Optimization)': 'Objetivo de IA (Optimización)',
      'Code Generation': 'Generación de Código',
      'Session History (Temporary)': 'Historial de Sesión (Temporal)',
      'Session History': 'Historial de Sesión',
      'The generated prompt will appear here...': 'El prompt generado aparecerá aquí...',
      'View highlighted': 'Ver resaltado',
      'Edit plain text': 'Editar texto plano',
      'Copy prompt': 'Copiar prompt',
      'Ex: Make it more casual, change to neon light, add a mirror...': 'Ej: Hazlo más casual, cambia a luz de neón, añade un espejo...',
      'Image Recreation': 'Recreación de Imagen',
      'Upload a reference image to extract a detailed prompt.': 'Sube una imagen de referencia para extraer un prompt detallado.',
      'Change Image': 'Cambiar Imagen',
      'Analyzing...': 'Analizando...',
      'Analyzed': 'Analizado',
      'Extract Prompt': 'Extraer Prompt',
      'Extracted Prompt': 'Prompt Extraído',
      'Clean Prompt': 'Limpiar Prompt',
      'Revert': 'Revertir',
      'Save Style': 'Guardar Estilo',
      'Integrate into Scene': 'Integrar en la Escena',
      'Prompt Variations': 'Variaciones de Prompt',
      'Generate variations of your current prompt by changing specific aspects.': 'Genera variaciones de tu prompt actual cambiando aspectos específicos.',
      'Back to Prompting': 'Volver a Prompting',
      'No current prompt to vary. Go to the Prompting tab and create one.': 'No hay un prompt actual para variar. Ve a la pestaña de Prompting y crea uno.',
      'Change Pose': 'Cambiar Pose',
      'Change Lighting': 'Cambiar Iluminación',
      'Change Environment': 'Cambiar Entorno',
      'Change Style': 'Cambiar Estilo',
      'Change Clothing': 'Cambiar Ropa',
      'Change Expression': 'Cambiar Expresión',
      'Change Weather': 'Cambiar Clima',
      'Change Time of Day': 'Cambiar Hora del Día',
      'Change Camera Angle': 'Cambiar Ángulo de Cámara',
      'Change Color Palette': 'Cambiar Paleta de Colores',
      'Add Element': 'Añadir Elemento',
      'Remove Element': 'Eliminar Elemento',
      'Change Age': 'Cambiar Edad',
      'Change Era': 'Cambiar Época',
      'Change General Emotion': 'Cambiar Emoción General',
      'Ex: something dramatic...': 'Ej: algo dramático...',
      'Apply': 'Aplicar',
      'Prompt Flow (Storytelling)': 'Flujo de Prompts (Storytelling)',
      'Create a story or sequence of events based on your current prompt.': 'Crea una historia o secuencia de eventos basada en tu prompt actual.',
      'No current prompt. Go to the Prompting tab and create one.': 'No hay un prompt actual. Ve a la pestaña de Prompting y crea uno.',
      'Story Configuration': 'Configuración de la Historia',
      'Describe the story or general context:': 'Describe la historia o el contexto general:',
      'Ex: A heavy day at work, from waking up until returning home exhausted...': 'Ej: Un día pesado en el trabajo, desde despertar hasta volver a casa agotado...',
      'Number of prompts (Max 20):': 'Número de prompts (Máx 20):',
      'Final Prompt Position:': 'Posición del Prompt Final:',
      'Automatic (Based on coherence)': 'Automático (Basado en coherencia)',
      'Position': 'Posición',
      'Generating Flow...': 'Generando Flujo...',
      'Generate Story': 'Generar Historia',
      'Escena': 'Escena',
      'Prompting General': 'Prompting General',
      'Recreación': 'Recreación',
      'Variaciones': 'Variaciones',
      'Flow': 'Flow',
      'Alquimia': 'Alquimia',
      'Feed': 'Feed',
      'Co-Working': 'Co-Working',
    },
    // Add other languages as needed
  };

  const t = (key: string) => {
    if (language === 'en') return key;
    return translations[language]?.[key] || key;
  };

  // Tab Grouping
  const [activeTabGroup, setActiveTabGroup] = useState<'tools' | 'community' | 'admin'>('tools');

  // Recreation Enhancements
  const [recreationSubjectImage, setRecreationSubjectImage] = useState<string | null>(null);
  const [recreationReferenceImage, setRecreationReferenceImage] = useState<string | null>(null);
  const [showSmartphoneModal, setShowSmartphoneModal] = useState(false);
  const [smartphoneModel, setSmartphoneModel] = useState('');
  const [showSaveStyleModal, setShowSaveStyleModal] = useState(false);
  const [styleName, setStyleName] = useState('');
  const [savedStyles, setSavedStyles] = useState<{name: string, prompt: string, type: 'full' | 'partial'}[]>(() => {
    const saved = localStorage.getItem('scenecraft_saved_styles');
    return saved ? JSON.parse(saved) : [];
  });

  const handleSaveStyle = (name: string, type: 'full' | 'partial') => {
    if (!name.trim()) return;
    const newStyle = {
      name,
      prompt: extractedPrompt || '',
      type
    };
    const updatedStyles = [...savedStyles, newStyle];
    setSavedStyles(updatedStyles);
    localStorage.setItem('scenecraft_saved_styles', JSON.stringify(updatedStyles));
    setShowSaveStyleModal(false);
    setStyleName('');
  };
  const [saveStyleOptions, setSaveStyleOptions] = useState({
    subject: true,
    background: true,
    quality: true,
    lighting: true,
    style: true,
    perception: true
  });

  const activeCategories = useMemo(() => {
    const base = workMode === 'influencer' ? INFLUENCER_CATEGORIES : GENERAL_CATEGORIES;
    const custom = customCategories
      .filter(c => !c.parentId)
      .map(c => ({
        id: c.id,
        label: c.name,
        icon: c.icon || 'Folder',
        color: c.color || 'text-zinc-300',
        isCustom: true
      }));
    return [...base, ...custom];
  }, [workMode, customCategories]);

  const allCategoriesCombined = useMemo(() => {
    const customMapped = customCategories.map(c => ({
      id: c.id,
      label: c.name,
      icon: c.icon || 'Folder',
      color: c.color || 'text-zinc-300',
      isCustom: true
    }));
    return [...ALL_CATEGORIES, ...customMapped];
  }, [customCategories]);
  const handleSaveCategory = async (cat: CustomCategory) => {
    if (currentUser) {
      try {
        await setDoc(doc(db, 'customCategories', cat.id), cat);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `customCategories/${cat.id}`);
      }
    } else {
      setCustomCategories(prev => {
        const updated = prev.find(c => c.id === cat.id) 
          ? prev.map(c => c.id === cat.id ? cat : c)
          : [...prev, cat];
        localStorage.setItem('local_customCategories', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    showConfirm(
      t('Delete Category'),
      t('Are you sure you want to delete this category?') + ' ' + t('All blocks inside will also be deleted.'),
      async () => {
        if (currentUser) {
          try {
            await deleteDoc(doc(db, 'customCategories', id));
            // Also delete associated blocks
            const blocksToDelete = customBlocks.filter(b => b.categoryId === id);
            for (const block of blocksToDelete) {
              await deleteDoc(doc(db, 'customBlocks', block.id));
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `customCategories/${id}`);
          }
        } else {
          setCustomCategories(prev => {
            const updated = prev.filter(c => c.id !== id);
            localStorage.setItem('local_customCategories', JSON.stringify(updated));
            return updated;
          });
          setCustomBlocks(prev => {
            const updated = prev.filter(b => b.categoryId !== id);
            localStorage.setItem('local_customBlocks', JSON.stringify(updated));
            return updated;
          });
        }
        if (activeCategory === id) {
          setActiveCategory(ALL_CATEGORIES[0].id);
        }
      }
    );
  };

  const handleSaveFolder = async (folder: PromptFolder) => {
    if (currentUser) {
      try {
        await setDoc(doc(db, 'promptFolders', folder.id), folder);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `promptFolders/${folder.id}`);
      }
    } else {
      setPromptFolders(prev => {
        const updated = prev.find(f => f.id === folder.id) 
          ? prev.map(f => f.id === folder.id ? folder : f)
          : [...prev, folder];
        localStorage.setItem('local_promptFolders', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteFolder = async (id: string) => {
    showConfirm(
      t('Delete Folder'),
      t('Are you sure you want to delete this folder?') + ' ' + t('The prompts inside will not be deleted, but will lose their association.'),
      async () => {
        if (currentUser) {
          try {
            await deleteDoc(doc(db, 'promptFolders', id));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `promptFolders/${id}`);
          }
        } else {
          setPromptFolders(prev => {
            const updated = prev.filter(f => f.id !== id);
            localStorage.setItem('local_promptFolders', JSON.stringify(updated));
            return updated;
          });
        }
      }
    );
  };

  const handleSaveCustomBlock = async (block: CustomBlock) => {
    if (currentUser) {
      try {
        await setDoc(doc(db, 'customBlocks', block.id), block);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `customBlocks/${block.id}`);
      }
    } else {
      setCustomBlocks(prev => {
        const updated = prev.find(b => b.id === block.id) 
          ? prev.map(b => b.id === block.id ? block : b)
          : [...prev, block];
        localStorage.setItem('local_customBlocks', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeleteCustomBlock = async (id: string) => {
    showConfirm(
      t('Delete Item'),
      t('Are you sure you want to delete this item?') + ' ' + t('This action cannot be undone.'),
      async () => {
        if (currentUser) {
          try {
            await deleteDoc(doc(db, 'customBlocks', id));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `customBlocks/${id}`);
          }
        } else {
          setCustomBlocks(prev => {
            const updated = prev.filter(b => b.id !== id);
            localStorage.setItem('local_customBlocks', JSON.stringify(updated));
            return updated;
          });
        }
      }
    );
  };

  const handleSavePrompt = async (prompt: SavedPrompt) => {
    if (currentUser) {
      try {
        await setDoc(doc(db, 'savedPrompts', prompt.id), prompt);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `savedPrompts/${prompt.id}`);
      }
    } else {
      setSavedPrompts(prev => {
        const updated = prev.find(p => p.id === prompt.id) 
          ? prev.map(p => p.id === prompt.id ? prompt : p)
          : [...prev, prompt];
        localStorage.setItem('local_savedPrompts', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleDeletePrompt = async (id: string) => {
    showConfirm(
      t('Delete Prompt'),
      t('Are you sure you want to delete this prompt?') + ' ' + t('This action cannot be undone.'),
      async () => {
        if (currentUser) {
          try {
            await deleteDoc(doc(db, 'savedPrompts', id));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `savedPrompts/${id}`);
          }
        } else {
          setSavedPrompts(prev => {
            const updated = prev.filter(p => p.id !== id);
            localStorage.setItem('local_savedPrompts', JSON.stringify(updated));
            return updated;
          });
        }
      }
    );
  };

  // My Prompts State
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [promptFolders, setPromptFolders] = useState<PromptFolder[]>([]);
  const [copyToast, setCopyToast] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyToast({show: true, message: t('Copied successfully to clipboard')});
    setTimeout(() => setCopyToast({show: false, message: ''}), 3000);
  };

  const handleAlquimiaGenerate = async () => {
    if (alquimiaImages.every(img => img === null)) {
      setAlquimiaError(t("Please upload at least one image."));
      return;
    }

    setAlquimiaLoading(true);
    setAlquimiaError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          {
            parts: [
              { text: "Analyze these images and generate 5 distinct and coherent prompts that combine elements from all of them (subjects, environment, lighting, style, etc.). Vary camera angles, distances, poses, interactions, and photographic styles. Return the prompts in a JSON array of strings." },
              ...alquimiaImages.filter(img => img !== null).map(img => ({
                inlineData: {
                  mimeType: "image/jpeg",
                  data: img!.split(',')[1]
                }
              }))
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const newPrompts = JSON.parse(response.text);
      
      // Save current to history before updating
      if (alquimiaPrompts.length > 0) {
        setAlquimiaHistory(prev => [{ prompts: alquimiaPrompts, timestamp: Date.now() }, ...prev].slice(0, 10));
      }

      setAlquimiaPrompts(newPrompts);
    } catch (error) {
      console.error("Alquimia error:", error);
      setAlquimiaError(t("An error occurred while generating prompts. Please try again."));
    } finally {
      setAlquimiaLoading(false);
    }
  };

  useEffect(() => {
    const localSavedPrompts = localStorage.getItem('local_savedPrompts');
    if (localSavedPrompts) {
      setSavedPrompts(JSON.parse(localSavedPrompts));
    }
    const localPromptFolders = localStorage.getItem('local_promptFolders');
    if (localPromptFolders) {
      setPromptFolders(JSON.parse(localPromptFolders));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('local_savedPrompts', JSON.stringify(savedPrompts));
  }, [savedPrompts]);

  useEffect(() => {
    localStorage.setItem('local_promptFolders', JSON.stringify(promptFolders));
  }, [promptFolders]);

  const activeBlocks = useMemo(() => {
    if (activeCategory === 'my_prompts') {
      return savedPrompts.map(p => ({
        id: p.id,
        categoryId: 'my_prompts' as CategoryId,
        label: p.title,
        value: p.prompt,
        isCustom: true
      }));
    }
    const baseBlocks = workMode === 'influencer' ? INFLUENCER_BLOCKS : GENERAL_BLOCKS;
    return baseBlocks.filter(b => b.categoryId === activeCategory);
  }, [activeCategory, workMode, savedPrompts]);

  const handleOpenAddPromptModal = () => {
    setNewPromptTitle(t('Prompt {n}').replace('{n}', (savedPrompts.length + 1).toString()));
    setNewPromptContent(compiledPrompt || '');
    setShowAddPromptModal(true);
  };

  const handleAddPrompt = () => {
    if (!newPromptTitle.trim() || !newPromptContent.trim()) return;
    const id = `saved_prompt_${Date.now()}`;
    const newPrompt: SavedPrompt = {
      id,
      title: newPromptTitle,
      prompt: newPromptContent,
      authorId: currentUser?.uid || 'local_user',
      createdAt: Date.now()
    };
    setSavedPrompts(prev => [newPrompt, ...prev]);
    setShowAddPromptModal(false);
    setNewPromptTitle('');
    setNewPromptContent('');
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'warning' | 'info' = 'danger') => {
    setConfirmModal({
      show: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, show: false }));
      },
      type
    });
  };

  // Sorting & Filtering State
  const [historySort, setHistorySort] = useState<'date' | 'title'>('date');
  const [communitySort, setCommunitySort] = useState<'newest' | 'popular'>('newest');
  const [communitySearch, setCommunitySearch] = useState('');

  const [isManualGeneration, setIsManualGeneration] = useState(() => {
    const saved = localStorage.getItem('scenecraft_manual_gen');
    return saved ? JSON.parse(saved) : true;
  });
  const [aiTargetType, setAiTargetType] = useState(() => {
    const saved = localStorage.getItem('scenecraft_ai_target');
    return saved ? saved : 'midjourney';
  });
  const [manualPromptReady, setManualPromptReady] = useState(false);

  // Admin & User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [deletedPrompts, setDeletedPrompts] = useState<PromptSession[]>([]);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  // Alquimia State
  const [alquimiaImages, setAlquimiaImages] = useState<(string | null)[]>(Array(6).fill(null));
  const [alquimiaPrompts, setAlquimiaPrompts] = useState<string[]>([]);
  const [alquimiaHistory, setAlquimiaHistory] = useState<{prompts: string[], timestamp: number}[]>([]);
  const [alquimiaLoading, setAlquimiaLoading] = useState(false);
  const [alquimiaError, setAlquimiaError] = useState<string | null>(null);

  // Session History (Temporary, not persisted)
  const [sessionHistory, setSessionHistory] = useState<{prompt: string, timestamp: number}[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [bustSize, setBustSize] = useState('');
  const [showBustModal, setShowBustModal] = useState(false);

  // Scene Structure UI State
  const [sceneStructureHeight, setSceneStructureHeight] = useState<number>(200);
  const [isSceneStructureExpanded, setIsSceneStructureExpanded] = useState(false);
  const [isSceneStructureCollapsed, setIsSceneStructureCollapsed] = useState(false);
  const [isResizingScene, setIsResizingScene] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: userData.displayName || firebaseUser.displayName || 'User',
              hashtag: userData.hashtag || Math.random().toString(36).substring(2, 6).toUpperCase(),
              photoURL: userData.photoURL || firebaseUser.photoURL || '',
              isAdmin: userData.isAdmin || userData.role === 'admin',
              freePromptsUsed: userData.freePromptsUsed || 0,
              isSubscribed: userData.isSubscribed || false,
              subscriptionTier: userData.subscriptionTier || 'free',
              plan: userData.plan || 'free',
              createdAt: userData.createdAt,
              updatedAt: userData.updatedAt
            });
          } else {
            // Create new user with all required fields for rules validation
            const hashtag = Math.random().toString(36).substring(2, 6).toUpperCase();
            const newUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              hashtag: hashtag,
              isAdmin: false,
              freePromptsUsed: 0,
              isSubscribed: false,
              subscriptionTier: 'free',
              plan: 'free',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            
            try {
              await setDoc(userDocRef, newUser);
              setCurrentUser({
                ...newUser,
                createdAt: new Date(),
                updatedAt: new Date()
              });
            } catch (err) {
              console.warn("Could not create user profile in Firestore, using local fallback", err);
              setCurrentUser({
                ...newUser,
                createdAt: new Date(),
                updatedAt: new Date()
              });
            }
          }
        } catch (error) {
          console.warn("Could not load user profile from Firestore, using local fallback", error);
          // Fallback user object if Firestore fails
          setCurrentUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'User',
            hashtag: 'TEMP',
            photoURL: firebaseUser.photoURL || '',
            isAdmin: false,
            freePromptsUsed: 0,
            isSubscribed: false,
            subscriptionTier: 'free',
            plan: 'free',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      } else {
        setCurrentUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();
      setCurrentUser(null);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // Load from localStorage on mount
  useEffect(() => {
    // Initialize Socket
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('initial-data', (data) => {
      setCoworkingTopics(data.topics);
    });

    newSocket.on('new-message', (message) => {
      setCoworkingMessages(prev => [...prev, message]);
    });

    newSocket.on('topic-created', (topic) => {
      setCoworkingTopics(prev => [...prev, topic]);
    });

    newSocket.on('message-history', (messages) => {
      setCoworkingMessages(messages);
    });

    newSocket.on('invitation-received', (data) => {
      // Show a simple alert for now, could be a toast
      alert(t('Invitation received! {inviter} invited you to the topic: {topicTitle}').replace('{inviter}', data.inviter).replace('{topicTitle}', data.topicTitle));
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (socket && currentUser) {
      socket.emit('register-user', currentUser);
    }
  }, [socket, currentUser]);

  const handleInviteUser = (identifier: string) => {
    if (!socket || !activeTopic) return;
    socket.emit('invite-user', {
      topicId: activeTopic.id,
      identifier: identifier, // Can be email or Name#Hashtag
      inviter: currentUser?.displayName + '#' + currentUser?.hashtag
    });
    setInviteInput('');
    setShowInviteModal(false);
  };
  const handleUpdateUsername = async (newName: string) => {
    if (!currentUser) return;
    const hashtag = currentUser.hashtag || Math.floor(1000 + Math.random() * 9000).toString();
    const updatedUser = { ...currentUser, displayName: newName, hashtag };
    setCurrentUser(updatedUser);
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { 
        displayName: newName,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  useEffect(() => {
    if (currentUser && !currentUser.hashtag) {
      handleUpdateUsername(currentUser.displayName || 'User');
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      const saved = localStorage.getItem('scenecraft_library');
      if (saved) {
        setPromptHistory(JSON.parse(saved).sort((a: PromptSession, b: PromptSession) => b.date - a.date));
      } else {
        setPromptHistory([]);
      }
      return;
    }

    const q = query(
      collection(db, 'prompts'),
      where('authorId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prompts: PromptSession[] = [];
      snapshot.forEach((doc) => {
        prompts.push(doc.data() as PromptSession);
      });
      setPromptHistory(prompts.sort((a, b) => b.date - a.date));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'prompts');
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      
      // Load custom categories and blocks from localStorage if not logged in
      const localCategories = localStorage.getItem('local_customCategories');
      if (localCategories) {
        setCustomCategories(JSON.parse(localCategories));
      } else {
        setCustomCategories([]);
      }

      const localBlocks = localStorage.getItem('local_customBlocks');
      if (localBlocks) {
        setCustomBlocks(JSON.parse(localBlocks));
      } else {
        setCustomBlocks([]);
      }
      return;
    }

    // Load Custom Blocks
    const qCustomBlocks = query(collection(db, 'customBlocks'), where('authorId', '==', currentUser.uid));
    const unsubCustomBlocks = onSnapshot(qCustomBlocks, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setCustomBlocks(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customBlocks'));

    // Load Custom Categories
    const qCustomCategories = query(collection(db, 'customCategories'), where('authorId', '==', currentUser.uid));
    const unsubCustomCategories = onSnapshot(qCustomCategories, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setCustomCategories(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customCategories'));

    return () => {
      unsubCustomBlocks();
      unsubCustomCategories();
    };
  }, [currentUser]);

  useEffect(() => {
    const qNews = query(collection(db, 'news'), orderBy('date', 'desc'));
    const unsubNews = onSnapshot(qNews, (snapshot) => {
      const loaded: any[] = [];
      snapshot.forEach(doc => loaded.push(doc.data()));
      setNews(loaded);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'news'));
    return () => unsubNews();
  }, []);

  // Save to localStorage when states change
  useEffect(() => {
    localStorage.setItem('scenecraft_settings', JSON.stringify({
      theme,
      uiStyle,
      colorTheme,
      isNsfwEnabled,
      promptCharLimit,
      outputLanguage
    }));
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-style', uiStyle);
    document.documentElement.setAttribute('data-color', colorTheme);
  }, [theme, uiStyle, colorTheme, isNsfwEnabled, promptCharLimit, outputLanguage]);

  // Resizing logic for Scene Structure
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingScene) return;
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.7, e.clientY - 150)); // Adjusted offset
      setSceneStructureHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizingScene(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingScene) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingScene]);

  useEffect(() => {
    localStorage.setItem('favoriteBlocks', JSON.stringify(favoriteBlocks));
  }, [favoriteBlocks]);

  useEffect(() => {
    localStorage.setItem('communityFeed', JSON.stringify(communityFeed));
  }, [communityFeed]);

  // Compile prompt whenever dependencies change
  useEffect(() => {
    const compile = async () => {
      if (!isBannedWordsLocked) return; // Pause prompting if banned words are unlocked
      if (isEditingPrompt) return; // Don't auto-compile while user is manually editing
      
      // If manual generation is enabled, don't auto-compile
      if (isManualGeneration && !manualPromptReady) {
        return;
      }

      if (selectedBlocks.length === 0 && customInstructions.length === 0) {
        setPromptSegments([]);
        setCompiledPrompt('');
        return;
      }
      setIsCompiling(true);
      const segments = await generateCohesivePrompt(
        selectedBlocks, 
        customInstructions,
        isNsfwEnabled,
        isSubstitutionEnabled,
        bannedWords,
        outputLanguage
      );
      setPromptSegments(segments);
      setCompiledPrompt(segments.map(s => s.text).join(''));
      setIsCompiling(false);
      
      // Reset manual prompt ready flag after compilation
      if (manualPromptReady) {
        setManualPromptReady(false);
      }
    };
    
    const timeoutId = setTimeout(compile, 800);
    return () => clearTimeout(timeoutId);
  }, [selectedBlocks, customInstructions, isNsfwEnabled, isSubstitutionEnabled, bannedWords, isBannedWordsLocked, outputLanguage, isManualGeneration, manualPromptReady]);

  // Track session history
  useEffect(() => {
    if (compiledPrompt && compiledPrompt.trim() !== '') {
      const timer = setTimeout(() => {
        setSessionHistory(prev => {
          // Don't add if it's the same as the last one
          if (prev.length > 0 && prev[0].prompt === compiledPrompt) return prev;
          return [{ prompt: compiledPrompt, timestamp: Date.now() }, ...prev].slice(0, 50);
        });
      }, 3000); // 3 second stability check to avoid spamming history
      return () => clearTimeout(timer);
    }
  }, [compiledPrompt]);

  const handleManualGenerate = () => {
    setManualPromptReady(true);
  };

  const handleMagicEnhance = async () => {
    if (!compiledPrompt) return;
    setIsCompiling(true);
    try {
      const enhanced = await enhancePrompt(compiledPrompt);
      setCompiledPrompt(enhanced);
      setPromptSegments([{ text: enhanced, categoryId: 'custom' }]);
      setIsEditingPrompt(true);
      
      // Add to session history
      const newEntry = {
        prompt: enhanced,
        timestamp: Date.now(),
        type: 'enhanced' as const
      };
      setSessionHistory(prev => [newEntry, ...prev]);
    } catch (error) {
      console.error("Error enhancing prompt:", error);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleTargetModelChange = async (model: string) => {
    setTargetModel(model);
    if (!compiledPrompt) return;
    setIsCompiling(true);
    const adapted = await adaptPromptToModel(compiledPrompt, model);
    setCompiledPrompt(adapted);
    setPromptSegments([{ text: adapted, categoryId: 'custom' }]);
    setIsEditingPrompt(true);
    setIsCompiling(false);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '1') { setWorkMode('influencer'); setActiveTabGroup('tools'); }
        if (e.key === '2') { setWorkMode('prompting'); setActiveTabGroup('tools'); }
        if (e.key === '4') { setWorkMode('community'); setActiveTabGroup('community'); }
        if (e.key === 's') { e.preventDefault(); setShowSaveHistoryModal(true); }
        if (e.key === 'z') { 
          if (undoStack.length > 0) {
            const last = undoStack[undoStack.length - 1];
            setSelectedBlocks(last.blocks);
            setCustomInstructions(last.instructions);
            setUndoStack(prev => prev.slice(0, -1));
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, selectedBlocks, customInstructions]);

  // Fetch suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (selectedBlocks.length === 0) {
        setSuggestions([]);
        return;
      }
      setIsSuggesting(true);
      const suggestedIds = await suggestRelatedBlocks(selectedBlocks);
      const newSuggestions = suggestedIds
        .map(id => ALL_BLOCKS.find(b => b.id === id))
        .filter((b): b is Block => b !== undefined);
      setSuggestions(newSuggestions);
      setSuggestionPage(0);
      setIsSuggesting(false);
    };

    const timeoutId = setTimeout(fetchSuggestions, 1500);
    return () => clearTimeout(timeoutId);
  }, [selectedBlocks]);

  // Recreation Tab State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [extractedPrompt, setExtractedPrompt] = useState<string | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setExtractedPrompt(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!uploadedImage) return;
    setIsAnalyzingImage(true);
    try {
      const prompt = await analyzeImageForPrompt(uploadedImage);
      setExtractedPrompt(prompt);
    } catch (error) {
      console.error("Error analyzing image:", error);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleRefreshSuggestions = async () => {
    if (selectedBlocks.length === 0) return;
    setIsSuggesting(true);
    const suggestedIds = await suggestRelatedBlocks(selectedBlocks);
    const newSuggestions = suggestedIds
      .map(id => ALL_BLOCKS.find(b => b.id === id))
      .filter((b): b is Block => b !== undefined);
    setSuggestions(newSuggestions);
    setSuggestionPage(0);
    setIsSuggesting(false);
  };

  const totalSuggestionPages = Math.ceil(suggestions.length / SUGGESTIONS_PER_PAGE);
  const currentSuggestions = suggestions.slice(suggestionPage * SUGGESTIONS_PER_PAGE, (suggestionPage + 1) * SUGGESTIONS_PER_PAGE);

  const toggleBlock = (block: Block) => {
    if (block.isNsfw && !isNsfwEnabled) {
      setShowNsfwWarning(true);
      return;
    }
    
    // Special case for Smartphone
    if (block.id === 'pro_6' && !selectedBlocks.find(b => b.id === 'pro_6')) {
      setShowSmartphoneModal(true);
      return;
    }

    // Special case for Bust Size
    if (block.id === 'bod_5' && !selectedBlocks.find(b => b.id === 'bod_5')) {
      setShowBustModal(true);
      return;
    }
    
    setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
    
    setSelectedBlocks(prev => {
      const exists = prev.find(b => b.id === block.id);
      if (exists) {
        return prev.filter(b => b.id !== block.id);
      }
      return [...prev, block];
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setSelectedBlocks(previousState.blocks);
    setCustomInstructions(previousState.instructions);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);

    setIsChatting(true);
    // Add the chat input directly as a custom instruction
    setCustomInstructions(prev => [...prev, chatInput.trim()]);
    setChatInput('');
    
    // Reset textarea height
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
    }

    setIsChatting(false);
  };

  const removeCustomInstruction = (index: number) => {
    setCustomInstructions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEditedInstruction = () => {
    if (editingInstructionIndex !== null && editingInstructionText.trim() !== '') {
      setCustomInstructions(prev => prev.map((item, i) => i === editingInstructionIndex ? editingInstructionText.trim() : item));
      setShowEditInstructionModal(false);
      setEditingInstructionIndex(null);
      setEditingInstructionText('');
    }
  };

  const saveToHistory = () => {
    if (!compiledPrompt) return;
    setSaveHistoryTitle('');
    setShowSaveHistoryModal(true);
  };

  const generateHistoryTitle = async () => {
    if (!compiledPrompt) return;
    setIsGeneratingHistoryTitle(true);
    
    // Local fallback logic: take first 4-5 words and capitalize
    const words = compiledPrompt.split(' ').slice(0, 5);
    const localTitle = words.join(' ').replace(/[,.;]/g, '') + (words.length >= 5 ? '...' : '');
    
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate a short and descriptive English title (max 5 words) for this image generation prompt: "${compiledPrompt}". Return ONLY the title text.`,
      });
      if (response.text) {
        setSaveHistoryTitle(response.text.trim().replace(/["']/g, ''));
      } else {
        setSaveHistoryTitle(localTitle);
      }
    } catch (error) {
      console.error("Error generating title:", error);
      setSaveHistoryTitle(localTitle);
    } finally {
      setIsGeneratingHistoryTitle(false);
    }
  };

  const confirmSaveHistory = async () => {
    if (!compiledPrompt) return;
    const newSession: PromptSession = {
      id: Date.now().toString(),
      title: saveHistoryTitle || 'Untitled Prompt',
      date: Date.now(),
      mode: workMode,
      selectedBlocks: [...selectedBlocks],
      customInstructions: [...customInstructions],
      compiledPrompt,
      isFavorite: false,
      likes: 0,
      authorId: currentUser?.uid || 'local_user',
      authorName: currentUser?.displayName || 'Local User',
      isPublic: false
    };
    
    if (currentUser) {
      try {
        await setDoc(doc(db, 'prompts', newSession.id), newSession);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `prompts/${newSession.id}`);
      }
    } else {
      // Save to local storage
      const saved = localStorage.getItem('scenecraft_library');
      const library = saved ? JSON.parse(saved) : [];
      const updatedLibrary = [newSession, ...library];
      localStorage.setItem('scenecraft_library', JSON.stringify(updatedLibrary));
      setPromptHistory(updatedLibrary);
    }

    setShowSaveHistoryModal(false);
    setSaveHistoryTitle('');
    setCopyToast({ show: true, message: 'Saved to Library!' });
    setTimeout(() => setCopyToast({ show: false, message: '' }), 3000);
  };

  const confirmSmartphoneModel = () => {
    const smartphoneBlock = ALL_BLOCKS.find(b => b.id === 'pro_6');
    if (smartphoneBlock) {
      const customBlock: Block = {
        ...smartphoneBlock,
        label: t('Smartphone ({model})').replace('{model}', smartphoneModel || t('Generic model')),
        value: `smartphone, ${smartphoneModel || 'modern smartphone'}`
      };
      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
      setSelectedBlocks(prev => [...prev, customBlock]);
    }
    setShowSmartphoneModal(false);
    setSmartphoneModel('');
  };

  const confirmBustSize = () => {
    const bustBlock = ALL_BLOCKS.find(b => b.id === 'bod_5');
    if (bustBlock) {
      const customBlock: Block = {
        ...bustBlock,
        label: t('Bust ({size})').replace('{size}', bustSize || t('Natural measurement')),
        value: `specific bust size, bra cup ${bustSize || 'natural'}, proportional chest`
      };
      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
      setSelectedBlocks(prev => [...prev, customBlock]);
    }
    setShowBustModal(false);
    setBustSize('');
  };

  const deleteHistoryItem = async (id: string) => {
    const toDelete = promptHistory.find(p => p.id === id);
    if (toDelete) {
      setDeletedPrompts(prev => [toDelete, ...prev]);
    }
    try {
      await deleteDoc(doc(db, 'prompts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `prompts/${id}`);
    }
  };

  const renameHistoryItem = async (id: string, newTitle: string) => {
    try {
      await updateDoc(doc(db, 'prompts', id), { title: newTitle });
      setEditingHistoryId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prompts/${id}`);
    }
  };

  const toggleFavoriteBlock = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteBlocks(prev => 
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const toggleFavorite = async (id: string) => {
    const session = promptHistory.find(s => s.id === id);
    if (!session) return;
    try {
      await updateDoc(doc(db, 'prompts', id), { isFavorite: !session.isFavorite });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `prompts/${id}`);
    }
  };

  const loadSession = (session: PromptSession) => {
    setWorkMode(session.mode as WorkMode);
    if (Array.isArray(session.selectedBlocks)) {
      setSelectedBlocks(session.selectedBlocks);
    } else {
      try {
        setSelectedBlocks(JSON.parse(session.selectedBlocks as string));
      } catch (e) {
        setSelectedBlocks([]);
      }
    }
    setCustomInstructions(session.customInstructions || []);
    setCompiledPrompt(session.compiledPrompt || '');
    setPromptSegments([{ text: session.compiledPrompt || '', categoryId: 'custom' }]);
    setIsEditingPrompt(true);
    setShowHistory(false);
  };

  const handleAddBannedWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (bannedWordInput.trim()) {
      const newWords = bannedWordInput
        .split(',')
        .map(w => w.trim())
        .filter(w => w !== '' && !bannedWords.includes(w));
      
      if (newWords.length > 0) {
        setBannedWords(prev => [...prev, ...newWords]);
      }
      setBannedWordInput('');
    }
  };

  const removeBannedWord = (word: string) => {
    setBannedWords(prev => prev.filter(w => w !== word));
  };

  const handleAddCustomBlock = async (categoryId: string) => {
    const newBlock: CustomBlock = {
      id: `custom_${Date.now()}`,
      categoryId,
      label: t('New Subcategory'),
      value: '',
      title: t('New Subcategory'),
      promptText: '',
      isCustom: true,
      isNsfw: false,
      authorId: currentUser?.uid || 'local_user'
    };
    
    if (currentUser) {
      try {
        await setDoc(doc(db, 'customBlocks', newBlock.id), newBlock);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `customBlocks/${newBlock.id}`);
      }
    } else {
      setCustomBlocks(prev => {
        const updated = [...prev, newBlock];
        localStorage.setItem('local_customBlocks', JSON.stringify(updated));
        return updated;
      });
    }
    setEditingCustomBlock(newBlock.id);
    setNewCustomBlockTitle(newBlock.title);
    setNewCustomBlockText(newBlock.promptText);
  };

  const saveCustomBlock = async () => {
    if (!editingCustomBlock) return;
    
    const nsfwKeywords = ['desnuda', 'desnudo', 'sexo', 'pezones', 'vagina', 'pene', 'glúteos', 'lencería', 'transparente', 'naked', 'nude', 'sex', 'nipples', 'ass', 'lingerie'];
    const isNsfw = nsfwKeywords.some(word => newCustomBlockText.toLowerCase().includes(word) || newCustomBlockTitle.toLowerCase().includes(word));

    if (isNsfw && !isNsfwEnabled) {
      setShowNsfwWarning(true);
      return; // Prevent saving if NSFW is off and content is NSFW
    }

    if (currentUser) {
      try {
        await updateDoc(doc(db, 'customBlocks', editingCustomBlock), {
          label: newCustomBlockTitle,
          title: newCustomBlockTitle,
          value: newCustomBlockText,
          promptText: newCustomBlockText,
          isNsfw
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `customBlocks/${editingCustomBlock}`);
      }
    } else {
      setCustomBlocks(prev => {
        const updated = prev.map(b => b.id === editingCustomBlock ? {
          ...b,
          label: newCustomBlockTitle,
          title: newCustomBlockTitle,
          value: newCustomBlockText,
          promptText: newCustomBlockText,
          isNsfw
        } : b);
        localStorage.setItem('local_customBlocks', JSON.stringify(updated));
        return updated;
      });
    }
    setEditingCustomBlock(null);
  };

  const renderIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName];
    return IconComponent ? <IconComponent size={18} /> : <Icons.Circle size={18} />;
  };

  const getCategoryColor = (categoryId: string | null) => {
    if (!categoryId) return '';
    if (categoryId === 'custom') return 'text-white bg-white/10';
    const cat = ALL_CATEGORIES.find(c => c.id === categoryId);
    return cat?.color || 'text-zinc-300';
  };

  return (
    <div className={`h-screen text-zinc-200 flex flex-col overflow-hidden ${uiStyle === 'glass' ? 'bg-transparent' : 'bg-[#0A0A0A]'} ${uiStyle === 'brutalist' ? 'font-mono' : 'font-sans'}`}>
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl flex flex-col sticky top-0 z-[100]">
        {/* Row 1: Logo and Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 md:border-none">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-lg border border-white/5"
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
            >
              <Icons.Menu size={20} />
            </button>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/20 hidden sm:flex">
              <Icons.Zap size={18} />
            </div>
            <h1 className="font-semibold tracking-tight text-white hidden sm:block">SceneCraft AI</h1>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button 
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors p-2 rounded-lg hover:bg-zinc-800 hidden sm:block"
              title={t('Undo')}
            >
              <Icons.Undo2 size={18} />
            </button>
            <button 
              onClick={saveToHistory}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-medium text-xs md:text-sm px-3 md:px-4 py-1.5 rounded-full transition-colors flex items-center gap-2"
            >
              <Icons.Save size={14} />
              <span className="hidden sm:inline">{t('Save')}</span>
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                title={t('More options')}
              >
                <Icons.MoreVertical size={20} />
              </button>
              
              {/* Header Dropdown Menu */}
              <AnimatePresence>
                {showHeaderMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[110]"
                  >
                    <div className="p-2 flex flex-col gap-1">
                      <button 
                        onClick={() => { setShowHistory(true); setShowHeaderMenu(false); }}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors w-full text-left"
                      >
                        <Icons.BookMarked size={16} />
                        <span>{t('My Library')}</span>
                      </button>
                      <button 
                        onClick={() => { setShowSettings(true); setShowHeaderMenu(false); }}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors w-full text-left"
                      >
                        <Icons.Settings size={16} />
                        <span>{t('Account Settings')}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              className="md:hidden p-2 text-zinc-400 hover:text-white bg-zinc-900/50 rounded-lg border border-white/5"
              onClick={() => setShowRightSidebar(!showRightSidebar)}
            >
              <Icons.PanelRight size={20} />
            </button>
          </div>
        </div>

        {/* Row 2: Mother Tabs (Scrollable on mobile) */}
        <div className="flex items-center justify-start md:justify-center overflow-x-auto no-scrollbar px-4 py-2 gap-1 bg-zinc-900/20">
          <button 
            onClick={() => { setActiveTabGroup('tools'); setWorkMode('influencer'); }}
            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'tools' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t('Herramientas')}
          </button>
          <button 
            onClick={() => { setActiveTabGroup('community'); setWorkMode('community'); }}
            className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'community' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t('Comunidad')}
          </button>
          {currentUser?.isAdmin && (
            <button 
              onClick={() => { setActiveTabGroup('admin'); setWorkMode('admin'); }}
              className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all shrink-0 ${activeTabGroup === 'admin' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t('Admin')}
            </button>
          )}
        </div>

        {/* Row 3: Sub Tabs Row (Scrollable on mobile) */}
        <div className="flex items-center justify-start md:justify-center overflow-x-auto no-scrollbar px-4 py-2 border-t border-white/5">
          <div className="flex items-center gap-2 shrink-0">
            {activeTabGroup === 'tools' && (
              <>
                <button onClick={() => setWorkMode('influencer')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'influencer' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Escena')}</button>
                <button onClick={() => setWorkMode('prompting')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'prompting' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Prompting General')}</button>
                <button onClick={() => setWorkMode('recreation')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'recreation' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Recreación')}</button>
                <button onClick={() => setWorkMode('variations')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'variations' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Variaciones')}</button>
                <button onClick={() => setWorkMode('flow')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'flow' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Flow')}</button>
                <button onClick={() => setWorkMode('alquimia')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'alquimia' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-400 hover:text-blue-300'}`}>{t('Alquimia')}</button>
              </>
            )}
            {activeTabGroup === 'community' && (
              <>
                <button onClick={() => setWorkMode('community')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'community' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-400 hover:text-orange-300'}`}>{t('Feed')}</button>
                <button 
                  onClick={() => {
                    console.log("Switching to coworking mode");
                    setWorkMode('coworking');
                  }} 
                  className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'coworking' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-zinc-400 hover:text-orange-300'}`}
                >
                  {t('Co-Working')}
                </button>
              </>
            )}
            {activeTabGroup === 'admin' && (
              <button onClick={() => setWorkMode('admin')} className={`px-3 py-1 text-[10px] md:text-xs font-semibold rounded-md transition-colors shrink-0 ${workMode === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-zinc-400 hover:text-red-300'}`}>{t('Admin Panel')}</button>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* Global Tooltip Panel */}
        <AnimatePresence>
          {hoveredBlock && ALL_BLOCKS.find(b => b.id === hoveredBlock)?.categoryId === 'lens' && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-800/90 backdrop-blur-md border border-emerald-500/30 rounded-xl p-3 shadow-2xl max-w-sm w-full pointer-events-none"
            >
              <div className="flex items-center gap-2 mb-1">
                <Icons.Camera size={14} className="text-emerald-400" />
                <div className="text-sm text-white font-medium">
                  {ALL_BLOCKS.find(b => b.id === hoveredBlock)?.label}
                </div>
              </div>
              <div className="text-xs text-zinc-300 leading-relaxed">
                {hoveredBlock === 'len_1' && t('Wide field of view, ideal for landscapes or architecture. May distort edges.')}
                {hoveredBlock === 'len_2' && t('Natural perspective, similar to human vision. Excellent for reportage and street.')}
                {hoveredBlock === 'len_3' && t('The standard. Very versatile, ideal for half-body portraits and general use.')}
                {hoveredBlock === 'len_4' && t('Classic for portraits. Compresses the background and favors facial features.')}
                {hoveredBlock === 'len_5' && t('Brings distant objects closer and compresses perspective significantly. Very blurred background.')}
                {hoveredBlock === 'len_6' && t('Captures a lot of information from the environment. Useful in closed spaces.')}
                {hoveredBlock === 'len_12' && t('Natural smartphone style, great depth of field, visible digital processing.')}
                {!['len_1', 'len_2', 'len_3', 'len_4', 'len_5', 'len_6', 'len_12'].includes(hoveredBlock) && t('Specific lens effect to alter the image aesthetics.')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left Column: Categories & Blocks */}
        {(workMode === 'prompting' || workMode === 'influencer' || workMode === 'recreation' || workMode === 'variations') && (
          <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
              {showLeftSidebar && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowLeftSidebar(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] md:hidden"
                />
              )}
            </AnimatePresence>

            <aside className={`${showLeftSidebar ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 fixed md:relative left-0 top-0 bottom-0 w-80 border-r border-white/10 flex flex-col bg-[#0F0F0F] shrink-0 z-[150] md:z-40 h-full`}>
              {/* Mobile Close Button */}
              <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{t('Categories')}</span>
                <button onClick={() => setShowLeftSidebar(false)} className="p-2 text-zinc-400 hover:text-white">
                  <Icons.X size={20} />
                </button>
              </div>
              
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 pb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t('Visual Categories')}</h2>
                  <button 
                    onClick={() => setShowCategoryAndPromptManager(true)}
                    className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-all"
                    title={t('Manage Categories and Prompts')}
                  >
                    <Icons.Settings2 size={14} />
                  </button>
                </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                <div className="flex flex-col gap-1">
                  {activeCategories.map(cat => (
                    <motion.button
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      onMouseEnter={() => setHoveredCategory(cat.id)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeCategory === cat.id 
                          ? 'bg-zinc-800 text-white' 
                          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cat.color}>{renderIcon(cat.icon)}</div>
                        <span>{t(cat.label)}</span>
                      </div>
                      {selectedBlocks.filter(b => b.categoryId === cat.id).length > 0 && (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {selectedBlocks.filter(b => b.categoryId === cat.id).length}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Blocks Panel */}
            <div className="flex flex-col h-1/2 bg-[#141414]">
              <div className="flex-1 overflow-y-auto p-4 pb-8 custom-scrollbar">
                <div className="mb-4 bg-zinc-900/50 border border-white/5 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                    <Icons.MousePointerClick size={14} />
                    {activeCategory.startsWith('custom_cat_') 
                      ? customCategories.find(c => c.id === activeCategory)?.name || t('Custom Category')
                      : ALL_CATEGORIES.find(c => c.id === activeCategory)?.label || 'Selecciona opciones'}
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-1">{t('Click on the blocks to add them to your prompt.')}</p>
                </div>

                {activeCategory.startsWith('custom_cat_') ? (
                  <div className="flex flex-col gap-4">
                    {/* Subcategories */}
                    {customCategories.filter(c => c.parentId === activeCategory).length > 0 && (
                      <div className="flex flex-col gap-2">
                        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">{t('Subcategories')}</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {customCategories.filter(c => c.parentId === activeCategory).map(sub => (
                            <button
                              key={sub.id}
                              onClick={() => setActiveCategory(sub.id)}
                              className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/50 border border-white/5 hover:border-emerald-500/30 hover:bg-zinc-800 transition-all text-left"
                            >
                              <div className="text-emerald-400">
                                {renderIcon(sub.icon || 'Folder')}
                              </div>
                              <span className="text-xs text-zinc-300 truncate">{sub.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{t('Items')}</h4>
                        <button 
                          onClick={() => setShowCategoryAndPromptManager(true)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <Icons.Edit3 size={10} /> {t('Manage')}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {customBlocks.filter(b => b.categoryId === activeCategory).map(block => {
                          const isSelected = selectedBlocks.some(b => b.id === block.id);
                          return (
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              key={block.id}
                              onClick={() => toggleBlock(block)}
                              className={`p-2 rounded-lg text-xs font-medium transition-all border text-left flex flex-col gap-1 ${
                                isSelected 
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10' 
                                  : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:border-white/20 hover:bg-zinc-800'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="truncate">{t(block.label || block.title)}</span>
                                {block.isNsfw && (
                                  <span className="text-[8px] bg-red-500/20 text-red-400 px-1 rounded">NSFW</span>
                                )}
                              </div>
                              <span className="text-[9px] text-zinc-600 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                {block.value || block.promptText}
                              </span>
                            </motion.button>
                          );
                        })}
                        {customBlocks.filter(b => b.categoryId === activeCategory).length === 0 && (
                          <div className="col-span-full py-8 flex flex-col items-center justify-center text-zinc-600 border border-dashed border-white/5 rounded-xl">
                            <Icons.PackageOpen size={24} className="mb-2 opacity-20" />
                            <p className="text-[10px]">{t('No items in this category')}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Back button if it's a subcategory */}
                    {customCategories.find(c => c.id === activeCategory)?.parentId && (
                      <button 
                        onClick={() => {
                          const parentId = customCategories.find(c => c.id === activeCategory)?.parentId;
                          if (parentId) setActiveCategory(parentId);
                        }}
                        className="mt-2 flex items-center justify-center gap-2 p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-white hover:bg-white/5 text-[10px] transition-all"
                      >
                        <Icons.ArrowLeft size={12} /> {t('Back to top-level category')}
                      </button>
                    )}
                  </div>
                ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    {t(activeCategories.find(c => c.id === activeCategory)?.label || '')}
                    <button 
                      onClick={() => setShowMoreCategory(activeCategory)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                    >
                      ({t('(View More)')})
                    </button>
                  </h3>
                  <div className="relative group">
                    <Icons.Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input 
                      type="text"
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder={t('Filter...')}
                      className="bg-zinc-900 border border-white/5 rounded-full pl-7 pr-3 py-1 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 w-24 transition-all focus:w-32"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Favorites first and always visible */}
                  {activeBlocks.filter(b => b.categoryId === activeCategory && favoriteBlocks.includes(b.id)).map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    return (
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={`fav-${block.id}`} 
                        className="relative group"
                      >
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-all text-left flex items-center gap-2 ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          <Icons.Heart size={12} className="text-red-400 fill-red-400" />
                          {t(block.label)}
                        </button>
                      </motion.div>
                    );
                  })}

                  {/* Regular blocks (excluding favorites already shown) */}
                  {activeBlocks.filter(b => {
                    const matchesCategory = b.categoryId === activeCategory;
                    const isNotFav = !favoriteBlocks.includes(b.id);
                    const searchLower = blockSearch.toLowerCase();
                    return matchesCategory && isNotFav && (b.label.toLowerCase().includes(searchLower) || b.value.toLowerCase().includes(searchLower));
                  })
                    .slice(0, 12).map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    return (
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        key={block.id} 
                        className="relative group"
                      >
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-all text-left flex items-center gap-2 ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          {t(block.label)}
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          </div>
          </aside>
          </>
        )}

        {/* Center Column: Workspace */}
        <section className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A]">
          {/* Global Toggles */}
          {news.length > 0 && (
            <div className="px-6 py-3 border-b border-white/10 flex items-center gap-6 bg-zinc-900/30">
              <div className="flex-1 overflow-hidden">
                <motion.div 
                  animate={{ x: [0, -1000] }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                  className="flex items-center gap-8 whitespace-nowrap"
                >
                  {news.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                      <span className="text-emerald-400">{t('NEWS:')}</span>
                      <span className="text-zinc-400">{item.title}</span>
                    </div>
                  ))}
                </motion.div>
              </div>
            </div>
          )}

          {(workMode === 'prompting' || workMode === 'influencer') && (
            <>
              {/* Active Blocks Map */}
              <div 
                className={`relative border-b border-white/10 flex flex-col bg-[#0F0F0F]/50 group/scene transition-all duration-300 ${isSceneStructureCollapsed ? 'h-12 overflow-hidden' : ''}`}
                style={{ height: isSceneStructureCollapsed ? '48px' : (window.innerWidth < 768 ? '25vh' : sceneStructureHeight) }}
              >
                <div className="px-6 py-3 flex items-center justify-between border-b border-white/5 bg-[#0A0A0A]/50 shrink-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                    <Icons.Layers size={14} />
                    {t('Scene Structure')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsSceneStructureCollapsed(!isSceneStructureCollapsed)}
                      className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase"
                      title={isSceneStructureCollapsed ? t('Expand structure') : t('Collapse structure')}
                    >
                      {isSceneStructureCollapsed ? <Icons.ChevronDown size={12} /> : <Icons.ChevronUp size={12} />}
                      <span className="hidden sm:inline">{isSceneStructureCollapsed ? t('Expand') : t('Collapse')}</span>
                    </button>
                    {!isSceneStructureCollapsed && (
                      <button 
                        onClick={() => setIsSceneStructureExpanded(true)}
                        className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase"
                        title={t('Expand structure')}
                      >
                        <Icons.Maximize2 size={12} />
                        <span className="hidden sm:inline">{t('Manage')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-wrap content-start gap-2">
                  <AnimatePresence>
                    {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="w-full h-full min-h-[60px] flex items-center justify-center text-zinc-600 text-sm italic border border-dashed border-white/10 rounded-xl"
                      >
                        {t('Select blocks on the left or ask something in the chat to start.')}
                      </motion.div>
                    ) : (
                      <>
                        {selectedBlocks.map(block => {
                          const cat = ALL_CATEGORIES.find(c => c.id === block.categoryId);
                          return (
                            <motion.div
                              layout
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              key={block.id}
                              onMouseEnter={() => setHoveredCategory(block.categoryId)}
                              onMouseLeave={() => setHoveredCategory(null)}
                              className={`flex items-center gap-2 bg-zinc-800 border px-3 py-1.5 rounded-full text-sm text-zinc-200 group cursor-default transition-colors ${hoveredCategory === block.categoryId ? 'border-emerald-500/50' : 'border-white/10'}`}
                            >
                              <span className={`text-xs ${cat?.color || 'text-zinc-500'}`}>{cat?.label ? t(cat.label) : t('Custom')}:</span>
                              <span>{t(block.label)}</span>
                              <button 
                                onClick={() => toggleBlock(block)}
                                className="text-zinc-500 hover:text-red-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              >
                                <Icons.X size={14} />
                              </button>
                            </motion.div>
                          );
                        })}
                        {customInstructions.map((inst, idx) => (
                          <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            key={`inst_${idx}`}
                            onMouseEnter={() => setHoveredCategory('custom')}
                            onMouseLeave={() => setHoveredCategory(null)}
                            className={`flex items-center gap-2 bg-zinc-800 border px-3 py-1.5 rounded-full text-sm text-zinc-200 group transition-colors ${hoveredCategory === 'custom' ? 'border-emerald-500/50' : 'border-white/10'}`}
                          >
                            <span className="text-xs text-emerald-400">Chat:</span>
                            <span className="truncate max-w-[200px]">{inst}</span>
                            <button 
                              onClick={() => {
                                setEditingInstructionIndex(idx);
                                setEditingInstructionText(inst);
                                setShowEditInstructionModal(true);
                              }}
                              className="text-zinc-500 hover:text-blue-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            >
                              <Icons.Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => removeCustomInstruction(idx)}
                              className="text-zinc-500 hover:text-red-400 transition-colors ml-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                            >
                              <Icons.X size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Vertical Resizer Handle */}
                <div 
                  onMouseDown={() => setIsResizingScene(true)}
                  className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-emerald-500/50 transition-colors z-10 flex items-center justify-center group/handle"
                >
                  <div className="w-12 h-0.5 bg-white/10 rounded-full group-hover/handle:bg-white/30 transition-colors" />
                </div>
              </div>

              {/* Compiled Prompt */}
              <div className="flex-1 p-6 flex flex-col min-h-0 relative" style={{ height: window.innerWidth < 768 ? '65vh' : 'auto' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                      <Icons.Terminal size={14} />
                      {t('Prompt Final')}
                    </h2>

                    {/* Magic Enhance Button */}
                    <button 
                      onClick={handleMagicEnhance}
                      disabled={!compiledPrompt || isCompiling}
                      className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors bg-zinc-900/50 rounded-lg border border-white/5 group"
                      title={t('Magic Enhance (AI)')}
                    >
                      <Icons.Wand2 size={14} className={isCompiling ? 'animate-pulse' : 'group-hover:rotate-12 transition-transform'} />
                    </button>

                    {/* Character Limit Counter */}
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-white/5">
                      <Icons.Type size={12} className="text-zinc-500" />
                      <input 
                        type="number" 
                        value={promptCharLimit}
                        onChange={(e) => setPromptCharLimit(parseInt(e.target.value) || 0)}
                        className="bg-transparent text-[10px] text-zinc-300 font-bold w-10 focus:outline-none"
                        placeholder={t('Limit')}
                        title={t('Character limit')}
                      />
                      <div className="h-3 w-px bg-white/10 mx-1"></div>
                      <span className={`text-[10px] font-bold ${promptCharLimit > 0 && compiledPrompt.length > promptCharLimit ? 'text-red-500' : 'text-zinc-500'}`}>
                        {compiledPrompt.length}{promptCharLimit > 0 ? ` / ${promptCharLimit}` : ''}
                      </span>
                      {promptCharLimit > 0 && compiledPrompt.length > promptCharLimit && (
                        <button 
                          onClick={async () => {
                            setIsCompiling(true);
                            try {
                              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                              const response = await ai.models.generateContent({
                                model: "gemini-3-flash-preview",
                                contents: `Optimiza y acorta el siguiente prompt para que tenga menos de ${promptCharLimit} caracteres, manteniendo los elementos más importantes.
                                
                                Prompt: "${compiledPrompt}"
                                
                                Devuelve ÚNICAMENTE el prompt optimizado.`,
                              });
                              if (response.text) {
                                const optimized = response.text.trim();
                                setCompiledPrompt(optimized);
                                setPromptSegments([{ text: optimized, categoryId: 'custom' }]);
                                setIsEditingPrompt(true);
                              }
                            } catch (error) {
                              console.error("Error optimizing prompt:", error);
                            } finally {
                              setIsCompiling(false);
                            }
                          }}
                          className="ml-1 p-1 text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                          title={t('Optimize for limit')}
                        >
                          <Icons.Zap size={10} />
                        </button>
                      )}
                    </div>
                    {isManualGeneration && (
                      <button 
                        onClick={handleManualGenerate}
                        disabled={selectedBlocks.length === 0 && customInstructions.length === 0}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black text-xs font-bold rounded-lg transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1"
                      >
                        <Icons.Play size={12} /> {t('GENERATE NOW')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {!isBannedWordsLocked && (
                      <span className="text-xs text-red-400 font-medium flex items-center gap-1 animate-pulse">
                        <Icons.AlertTriangle size={12} /> {t('Editing banned words')}
                      </span>
                    )}
                    {isCompiling && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400">
                        <Icons.Loader2 size={12} className="animate-spin" />
                        {t('Compiling...')}
                      </div>
                    )}
                    
                    {/* Generation Mode Toggle */}
                    <button 
                      onClick={() => {
                        const newValue = !isManualGeneration;
                        setIsManualGeneration(newValue);
                        localStorage.setItem('scenecraft_manual_gen', JSON.stringify(newValue));
                      }}
                      className={`flex items-center gap-2 px-2 py-1 rounded border transition-all ${
                        isManualGeneration 
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                      title={isManualGeneration ? t('Switch to Auto Generation') : t('Switch to Manual Generation')}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${isManualGeneration ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {isManualGeneration ? t('Manual') : t('Auto')}
                      </span>
                    </button>

                    {/* IA Target Dropdown */}
                    <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-white/5">
                      <Icons.Settings size={12} className="text-zinc-500" />
                      <select 
                        value={targetModel}
                        onChange={(e) => {
                          setTargetModel(e.target.value);
                          localStorage.setItem('scenecraft_target_model', e.target.value);
                        }}
                        className="bg-transparent text-[10px] text-zinc-300 font-bold focus:outline-none uppercase tracking-wider"
                        title={t('AI Target (Optimization)')}
                      >
                        <option value="scenecraft">SceneCraft Soul</option>
                        <option value="midjourney">Midjourney (V6+)</option>
                        <option value="stable-diffusion">Stable Diffusion (XL/3)</option>
                        <option value="dalle-3">DALL-E 3</option>
                        <option value="flux">Flux.1 (Pro/Dev)</option>
                        <option value="nanobanana">Nanobanana Pro</option>
                        <option value="novelai">NovelAI.net</option>
                        <option value="chatgpt">ChatGPT (Vision)</option>
                        <option value="ideogram">Ideogram</option>
                        <option value="firefly">Adobe Firefly</option>
                        <option value="leonardo">Leonardo AI</option>
                        <option value="krea">Krea.ai</option>
                        <option value="starryai">StarryAI</option>
                        <option value="code">{t('Code Generation')}</option>
                      </select>
                    </div>

                    <button 
                      onClick={() => setShowSessionHistory(true)}
                      className="p-1.5 text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1.5 bg-zinc-900/50 rounded-lg border border-white/5"
                      title={t('Session History (Temporary)')}
                    >
                      <Icons.History size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">{t('Session History')}</span>
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 relative rounded-xl border border-white/10 bg-zinc-950 overflow-hidden flex flex-col group">
                  {isEditingPrompt ? (
                    <textarea
                      value={compiledPrompt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompiledPrompt(val);
                        setPromptSegments([{ text: val, categoryId: 'custom' }]);
                      }}
                      onBlur={() => setIsEditingPrompt(false)}
                      autoFocus
                      className="flex-1 w-full bg-transparent p-6 text-zinc-300 font-mono text-sm resize-none focus:outline-none custom-scrollbar leading-relaxed"
                    />
                  ) : (
                    <div 
                      className="flex-1 w-full p-6 font-mono text-sm overflow-y-auto custom-scrollbar leading-relaxed cursor-text whitespace-pre-wrap"
                    >
                      {promptSegments.length > 0 ? promptSegments.map((seg, i) => {
                        const isHovered = hoveredCategory && (hoveredCategory === seg.categoryId || (hoveredCategory === 'custom' && seg.categoryId === 'custom'));
                        const colorClass = getCategoryColor(seg.categoryId);
                        
                        return (
                          <span 
                            key={i} 
                            className={`transition-colors duration-200 ${isHovered ? 'bg-emerald-500/20 text-white' : colorClass || 'text-zinc-300'}`}
                            onMouseEnter={() => setHoveredCategory(seg.categoryId)}
                            onMouseLeave={() => setHoveredCategory(null)}
                          >
                            {seg.text}
                          </span>
                        );
                      }) : (
                        <span className="text-zinc-600 italic">{t('The generated prompt will appear here...')}</span>
                      )}
                    </div>
                  )}
                  
                  <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button 
                      onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-white/5"
                      title={isEditingPrompt ? t('View highlighted') : t('Edit plain text')}
                    >
                      {isEditingPrompt ? <Icons.Eye size={16} /> : <Icons.Edit3 size={16} />}
                    </button>
                    <button 
                      onClick={() => handleCopyPrompt(compiledPrompt)}
                      className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
                      title={t('Copy prompt')}
                    >
                      <Icons.Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-6 pt-0">
                <form onSubmit={handleChatSubmit} className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Icons.MessageSquare size={18} />
                  </div>
                  <textarea
                    ref={chatTextareaRef}
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSubmit(e as any);
                      }
                    }}
                    placeholder={t('Ex: Make it more casual, change to neon light, add a mirror...')}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl py-4 pl-12 pr-16 text-zinc-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-zinc-600 resize-none custom-scrollbar"
                    disabled={isChatting || !isBannedWordsLocked}
                    rows={1}
                    style={{ minHeight: '56px', maxHeight: '150px' }}
                  />
                  <button 
                    type="submit"
                    disabled={isChatting || !chatInput.trim() || !isBannedWordsLocked}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
                  >
                    {isChatting ? <Icons.Loader2 size={16} className="animate-spin" /> : <Icons.ArrowUp size={16} />}
                  </button>
                </form>
              </div>
            </>
          )}

          {workMode === 'recreation' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-2xl flex flex-col gap-6">
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-white mb-2">{t('Image Recreation')}</h2>
                  <p className="text-zinc-400 text-sm">{t('Upload a reference image to extract a detailed prompt.')}</p>
                </div>

                <div 
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-colors ${uploadedImage ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 hover:border-white/20 bg-zinc-900/50'}`}
                >
                  {uploadedImage ? (
                    <div className="w-full flex flex-col items-center gap-4">
                      <img src={uploadedImage} alt="Uploaded reference" className="max-h-[300px] rounded-lg object-contain" />
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            setUploadedImage(null);
                            setImageUrlInput('');
                          }}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                        >
                          {t('Change Image')}
                        </button>
                        <button 
                          onClick={analyzeImage}
                          disabled={isAnalyzingImage || !!extractedPrompt}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors flex items-center gap-2"
                        >
                          {isAnalyzingImage ? (
                            <><Icons.Loader2 size={16} className="animate-spin" /> {t('Analyzing...')}</>
                          ) : extractedPrompt ? (
                            <><Icons.Check size={16} /> {t('Analyzed')}</>
                          ) : (
                            <><Icons.Sparkles size={16} /> {t('Extract Prompt')}</>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Icons.ImagePlus size={48} className="text-zinc-600 mb-4" />
                      <p className="text-zinc-400 text-sm mb-4 text-center">{t('Drag and drop an image here, or click to select.')}</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors mb-6"
                      >
                        {t('Select File')}
                      </button>
                      
                      <div className="w-full max-w-md flex items-center gap-2">
                        <div className="h-px bg-white/10 flex-1"></div>
                        <span className="text-xs text-zinc-500 uppercase font-medium">{t('Or use a link')}</span>
                        <div className="h-px bg-white/10 flex-1"></div>
                      </div>
                      
                      <div className="w-full max-w-md mt-6 flex gap-2">
                        <input 
                          type="url" 
                          placeholder={t('Paste image URL here...')} 
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                        />
                        <button 
                          onClick={() => {
                            if (imageUrlInput) {
                              setUploadedImage(imageUrlInput);
                              setExtractedPrompt(null);
                            }
                          }}
                          disabled={!imageUrlInput}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
                        >
                          {t('Load URL')}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {extractedPrompt && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4"
                  >
                    <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                      <Icons.FileText size={16} /> {t('Extracted Prompt')}
                    </h3>
                    <p className="text-zinc-300 text-sm leading-relaxed font-mono bg-black/30 p-4 rounded-xl border border-white/5">
                      {extractedPrompt}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowCleanModal(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-1.5"
                        >
                          <Icons.Eraser size={14} /> {t('Clean Prompt')}
                        </button>
                        {originalRecreationPrompt && extractedPrompt !== originalRecreationPrompt && (
                          <button 
                            onClick={() => setExtractedPrompt(originalRecreationPrompt)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-1.5"
                          >
                            <Icons.Undo size={14} /> {t('Revert')}
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowSaveStyleModal(true)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-white/10 transition-colors flex items-center gap-2"
                        >
                          <Icons.Bookmark size={16} /> {t('Save Style')}
                        </button>
                        <button 
                          onClick={() => setShowComparisonModal(true)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-colors flex items-center gap-2"
                        >
                          <Icons.GitMerge size={16} /> {t('Integrate into Scene')}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {workMode === 'variations' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{t('Prompt Variations')}</h2>
                    <p className="text-zinc-400 text-sm">{t('Generate variations of your current prompt by changing specific aspects.')}</p>
                  </div>
                  <button 
                    onClick={() => setWorkMode('prompting')}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
                  >
                    <Icons.ArrowLeft size={16} /> {t('Back to Prompting')}
                  </button>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-zinc-400">Prompt Base</h3>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[100px] font-mono">
                    {compiledPrompt || <span className="text-zinc-600 italic">{t('No current prompt to vary. Go to the Prompting tab and create one.')}</span>}
                  </div>
                </div>

                {compiledPrompt && (
                  <div className="flex overflow-x-auto gap-4 pb-4 custom-scrollbar snap-x">
                    {[
                      { title: t("Change Pose"), icon: Icons.User, basePrompt: t("Change Pose") },
                      { title: t("Change Lighting"), icon: Icons.Sun, basePrompt: t("Change Lighting") },
                      { title: t("Change Environment"), icon: Icons.Map, basePrompt: t("Change Environment") },
                      { title: t("Change Style"), icon: Icons.Palette, basePrompt: t("Change Style") },
                      { title: t("Change Clothing"), icon: Icons.Shirt, basePrompt: t("Change Clothing") },
                      { title: t("Change Expression"), icon: Icons.Smile, basePrompt: t("Change Expression") },
                      { title: t("Change Weather"), icon: Icons.CloudRain, basePrompt: t("Change Weather") },
                      { title: t("Change Time of Day"), icon: Icons.Clock, basePrompt: t("Change Time of Day") },
                      { title: t("Change Camera Angle"), icon: Icons.Camera, basePrompt: t("Change Camera Angle") },
                      { title: t("Change Color Palette"), icon: Icons.Droplet, basePrompt: t("Change Color Palette") },
                      { title: t("Add Element"), icon: Icons.PlusCircle, basePrompt: t("Add Element") },
                      { title: t("Remove Element"), icon: Icons.MinusCircle, basePrompt: t("Remove Element") },
                      { title: t("Change Age"), icon: Icons.UserPlus, basePrompt: t("Change Age") },
                      { title: t("Change Era"), icon: Icons.Hourglass, basePrompt: t("Change Era") },
                      { title: t("Change General Emotion"), icon: Icons.Heart, basePrompt: t("Change General Emotion") },
                    ].map((variation, idx) => (
                      <div
                        key={idx}
                        className="min-w-[280px] p-6 rounded-2xl border border-white/5 bg-zinc-900 flex flex-col items-center text-center gap-4 snap-center"
                      >
                        <div className="p-3 bg-zinc-950 rounded-xl text-emerald-400">
                          <variation.icon size={24} />
                        </div>
                        <div className="font-medium text-white">{variation.title}</div>
                        <div className="text-xs text-zinc-500">{variation.basePrompt}</div>
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            const input = (e.target as any).elements.customInput.value;
                            if (!input.trim()) return;
                            setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                            setCustomInstructions(prev => [...prev, `${variation.basePrompt} ${input}`]);
                            setWorkMode('prompting');
                          }}
                          className="w-full flex flex-col gap-2 mt-auto"
                        >
                          <input 
                            name="customInput"
                            type="text" 
                            placeholder={t("Ex: something dramatic...")} 
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                          />
                          <button 
                            type="submit"
                            className="w-full py-2 rounded-lg text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
                          >
                            {t('Apply')}
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'flow' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{t('Prompt Flow (Storytelling)')}</h2>
                    <p className="text-zinc-400 text-sm">{t('Create a story or sequence of events based on your current prompt.')}</p>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-zinc-400">Prompt Final (Bloqueado)</h3>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[100px] font-mono opacity-70">
                    {compiledPrompt || <span className="text-zinc-600 italic">{t('No current prompt. Go to the Prompting tab and create one.')}</span>}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-white">{t('Story Configuration')}</h3>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-zinc-400">{t('Describe the story or general context:')}</label>
                    <textarea 
                      value={flowStory}
                      onChange={(e) => setFlowStory(e.target.value)}
                      placeholder={t('Ex: A heavy day at work, from waking up until returning home exhausted...')}
                      className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-xs text-zinc-400">{t('Number of prompts (Max 20):')}</label>
                      <input 
                        type="number" 
                        min="2" max="20"
                        value={flowCount}
                        onChange={(e) => setFlowCount(Math.min(20, Math.max(2, parseInt(e.target.value) || 5)))}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <label className="text-xs text-zinc-400">{t('Final Prompt Position:')}</label>
                      <select 
                        value={flowFinalPromptPosition}
                        onChange={(e) => setFlowFinalPromptPosition(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                      >
                        <option value="-">{t('Automatic (Based on coherence)')}</option>
                        {Array.from({length: flowCount}).map((_, i) => (
                          <option key={i} value={i + 1}>{t('Position')} {i + 1}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      setIsGeneratingFlow(true);
                      try {
                        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY });
                        const response = await ai.models.generateContent({
                          model: 'gemini-3-flash-preview',
                          contents: `Crea una secuencia de ${flowCount} prompts en inglés para generar imágenes que cuenten la siguiente historia: "${flowStory}".
                          El prompt original (que debe ser uno de los prompts en la secuencia) es: "${compiledPrompt}".
                          ${flowFinalPromptPosition !== '-' ? `El prompt original DEBE estar en la posición ${flowFinalPromptPosition} de la secuencia.` : 'El prompt original debe integrarse donde tenga más sentido narrativo.'}
                          
                          Asegúrate de mantener la coherencia visual (mismo personaje, estilo, iluminación si aplica) a lo largo de la secuencia.`,
                          config: {
                            responseMimeType: "application/json",
                            responseSchema: {
                              type: Type.OBJECT,
                              properties: {
                                story: { type: Type.STRING, description: "La historia completa y detallada en español que conecta todas las escenas." },
                                prompts: {
                                  type: Type.ARRAY,
                                  items: {
                                    type: Type.OBJECT,
                                    properties: {
                                      title: { type: Type.STRING, description: "Un título corto en español para la escena." },
                                      description: { type: Type.STRING, description: "Una breve descripción en español de lo que sucede." },
                                      prompt: { type: Type.STRING, description: "El prompt detallado en inglés para generar la imagen." },
                                      isOriginal: { type: Type.BOOLEAN, description: "true si es el prompt original, false en caso contrario." }
                                    },
                                    required: ["title", "description", "prompt", "isOriginal"]
                                  }
                                }
                              },
                              required: ["story", "prompts"]
                            }
                          }
                        });
                        
                        const jsonStr = response.text || '{}';
                        const parsedFlow = JSON.parse(jsonStr);
                        setGeneratedFlow(parsedFlow.prompts || []);
                        setGeneratedStory(parsedFlow.story || '');
                      } catch (error) {
                        console.error("Error generating flow:", error);
                        // Fallback in case of error
                        setGeneratedFlow([
                          { title: 'Error', description: 'Hubo un error al generar el flujo.', prompt: 'Error generating flow.', isOriginal: false }
                        ]);
                      } finally {
                        setIsGeneratingFlow(false);
                      }
                    }}
                    disabled={isGeneratingFlow || !compiledPrompt || !flowStory.trim()}
                    className="mt-2 w-full py-3 rounded-xl font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 flex items-center justify-center gap-2"
                  >
                    {isGeneratingFlow ? <Icons.Loader2 size={18} className="animate-spin" /> : <Icons.Wand2 size={18} />}
                    {isGeneratingFlow ? t('Generating Flow...') : t('Generate Story')}
                  </button>
                </div>

                {generatedFlow.length > 0 && (
                  <div className="flex flex-col gap-4 mt-4">
                    {generatedStory && (
                      <div className="bg-zinc-900 border border-white/5 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-emerald-400 mb-2">Historia Narrativa</h3>
                        <p className="text-sm text-zinc-300 leading-relaxed">{generatedStory}</p>
                      </div>
                    )}
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Icons.ListOrdered size={20} className="text-emerald-400" />
                      Flujo Generado
                    </h3>
                    <div className="flex flex-col gap-3">
                      {generatedFlow.map((item, index) => (
                        <div key={index} className={`bg-zinc-900 border ${item.isOriginal ? 'border-emerald-500/50' : 'border-white/5'} rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden`}>
                          {item.isOriginal && (
                            <div className="absolute top-0 right-0 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                              <Icons.Lock size={10} /> PROMPT ORIGINAL
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${item.isOriginal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                {index + 1}
                              </span>
                              <h4 className="font-medium text-white">{item.title}</h4>
                            </div>
                            <button 
                              onClick={() => handleCopyPrompt(item.prompt)}
                              className="text-zinc-500 hover:text-emerald-400 transition-colors" 
                              title={t('Copy prompt')}
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                          <p className="text-xs text-zinc-400">{item.description}</p>
                          <div className="bg-black/30 p-3 rounded-lg text-sm text-zinc-300 font-mono mt-1">
                            {item.prompt}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'community' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{t('Community & Inspiration')}</h2>
                    <p className="text-zinc-400 text-sm">{t('Explore prompts created by other users, get inspired and share your creations.')}</p>
                  </div>
                  <button 
                    onClick={() => setShowShareModal(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-colors flex items-center gap-2"
                  >
                    <Icons.Upload size={16} /> Compartir Prompt
                  </button>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mt-4">
                  <div className="relative flex-1 w-full">
                    <Icons.Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={communitySearch}
                      onChange={(e) => setCommunitySearch(e.target.value)}
                      placeholder={t('Search by title or prompt...')}
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <span className="text-xs text-zinc-500 whitespace-nowrap">Ordenar por:</span>
                    <select 
                      value={communitySort}
                      onChange={(e) => setCommunitySort(e.target.value as any)}
                      className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer flex-1 md:flex-none"
                    >
                      <option value="newest">{t('Most recent')}</option>
                      <option value="popular">{t('Most popular')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                  {communityFeed
                    .filter(post => {
                      const searchLower = communitySearch.toLowerCase();
                      return post.title.toLowerCase().includes(searchLower) || post.prompt.toLowerCase().includes(searchLower);
                    })
                    .sort((a, b) => {
                      if (communitySort === 'newest') return parseInt(b.id) - parseInt(a.id);
                      // Simulate popularity with id for now or random
                      return (b.title.length) - (a.title.length);
                    })
                    .map(post => (
                    <div 
                      key={post.id} 
                      className="bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden flex flex-col group hover:border-white/20 transition-all cursor-pointer"
                      onClick={() => setExpandedPost(post)}
                    >
                      <div className="h-40 bg-zinc-800 relative overflow-hidden">
                        <img src={post.image} alt={post.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                          <h3 className="font-semibold text-white truncate">{post.title}</h3>
                        </div>
                      </div>
                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <p className="text-xs text-zinc-400 font-mono line-clamp-3 flex-1">
                          {post.prompt}
                        </p>
                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser(post.user);
                              setShowUserProfileModal(true);
                            }}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                              <Icons.User size={12} />
                            </div>
                            {post.user}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                              setCustomInstructions([post.prompt]);
                              setSelectedBlocks([]);
                              setWorkMode('prompting');
                            }}
                            className="text-zinc-500 hover:text-emerald-400 transition-colors" 
                            title={t('Take to Prompting')}
                          >
                            <Icons.ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {workMode === 'alquimia' && (
            <div className="flex-1 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{t('Prompt Alchemy')}</h2>
                    <p className="text-zinc-400 text-sm">{t('Combine up to 6 images to generate unique and coherent prompts.')}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAlquimiaHistory([])}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-2"
                    >
                      <Icons.Trash2 size={16} /> Limpiar Historial
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {alquimiaImages.map((img, idx) => (
                    <div key={idx} className="aspect-[3/4] bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden relative group flex flex-col items-center justify-center">
                      {img ? (
                        <>
                          <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => {
                                const newImages = [...alquimiaImages];
                                newImages[idx] = null;
                                setAlquimiaImages(newImages);
                              }}
                              className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors"
                            >
                              <Icons.X size={20} />
                            </button>
                          </div>
                        </>
                      ) : (
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (re) => {
                                  const newImages = [...alquimiaImages];
                                  newImages[idx] = re.target?.result as string;
                                  setAlquimiaImages(newImages);
                                };
                                reader.readAsDataURL(file);
                              }
                            };
                            input.click();
                          }}
                          className="flex flex-col items-center gap-2 text-zinc-600 hover:text-emerald-400 transition-colors"
                        >
                          <Icons.Upload size={24} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Subir</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button 
                  onClick={handleAlquimiaGenerate}
                  disabled={alquimiaLoading || alquimiaImages.every(img => img === null)}
                  className="w-full py-4 rounded-2xl font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {alquimiaLoading ? <Icons.Loader2 size={24} className="animate-spin" /> : <Icons.Zap size={24} />}
                  {alquimiaLoading ? 'ANALIZANDO Y TRANSMUTANDO...' : 'GENERAR ALQUIMIA'}
                </button>

                {alquimiaError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-center gap-3">
                    <Icons.AlertCircle size={18} />
                    {alquimiaError}
                  </div>
                )}

                {alquimiaPrompts.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Icons.Sparkles size={20} className="text-emerald-400" />
                      {t('Transmutation Results')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {alquimiaPrompts.map((p, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-zinc-900 border border-white/5 rounded-2xl p-5 flex flex-col gap-3 group relative"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{t('Variation')} {i + 1}</span>
                            <button 
                              onClick={() => handleCopyPrompt(p)}
                              className="p-2 text-zinc-500 hover:text-emerald-400 transition-colors"
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                          <p className="text-sm text-zinc-300 leading-relaxed font-mono line-clamp-4 group-hover:line-clamp-none transition-all">
                            {p}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {alquimiaHistory.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-zinc-500 mb-4 flex items-center gap-2">
                      <Icons.History size={20} />
                      {t('Alchemy History')}
                    </h3>
                    <div className="space-y-4">
                      {alquimiaHistory.map((h, i) => (
                        <div key={i} className="bg-zinc-900/30 border border-white/5 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-zinc-600">{new Date(h.timestamp).toLocaleString()}</span>
                            <button 
                              onClick={() => setAlquimiaPrompts(h.prompts)}
                              className="text-xs text-emerald-500 hover:underline"
                            >
                              Restaurar este lote
                            </button>
                          </div>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                            {h.prompts.map((p, pi) => (
                              <div key={pi} className="min-w-[200px] bg-zinc-950 p-3 rounded-lg text-[10px] text-zinc-500 line-clamp-2">
                                {p}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {workMode === 'coworking' && (
            <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden">
              <div className="flex-1 flex overflow-hidden">
                {/* Topics Sidebar */}
                <div className="w-80 border-r border-white/5 bg-[#0F0F0F] flex flex-col">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="text-white font-bold flex items-center gap-2">
                      <Icons.MessageSquare size={18} className="text-orange-400" />
                      Coworking
                    </h3>
                    <button 
                      onClick={() => setShowCreateTopicModal(true)}
                      className="p-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
                    >
                      <Icons.Plus size={18} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {coworkingTopics.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => {
                          setActiveTopic(topic);
                          socket?.emit('join-topic', topic.id);
                        }}
                        className={`w-full p-3 rounded-xl text-left transition-all ${activeTopic?.id === topic.id ? 'bg-orange-500/20 border border-orange-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                      >
                        <div className="font-bold text-white text-sm truncate">{topic.title}</div>
                        <div className="text-xs text-zinc-500 truncate">{topic.description}</div>
                      </button>
                    ))}
                    {coworkingTopics.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <Icons.MessageSquare size={48} className="text-zinc-700 mb-4" />
                        <p className="text-zinc-500 text-sm">{t('No coworking topics yet.')}</p>
                        <button 
                          onClick={() => setShowCreateTopicModal(true)}
                          className="mt-4 px-4 py-2 bg-orange-500 text-black rounded-lg text-sm font-bold hover:bg-orange-400 transition-colors"
                        >
                          Crear Primer Tema
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col bg-[#0A0A0A]">
                  {activeTopic ? (
                    <>
                      <div className="p-4 border-b border-white/5 bg-[#0F0F0F] flex items-center justify-between">
                        <div>
                          <h3 className="text-white font-bold">{activeTopic.title}</h3>
                          <p className="text-xs text-zinc-500">{activeTopic.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setShowInviteModal(true)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors flex items-center gap-2"
                          >
                            <Icons.UserPlus size={14} /> Invitar
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {coworkingMessages.filter(m => m.topicId === activeTopic.id).map((msg, idx) => (
                          <div key={idx} className={`flex flex-col ${msg.userId === currentUser?.uid ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold text-zinc-500">{msg.userName}#{msg.userHashtag}</span>
                            </div>
                            <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${msg.userId === currentUser?.uid ? 'bg-orange-500 text-black rounded-tr-none' : 'bg-zinc-800 text-white rounded-tl-none'}`}>
                              {msg.text}
                            </div>
                            <span className="text-[10px] text-zinc-600 mt-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 bg-[#0F0F0F] border-t border-white/5">
                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!coworkingInput.trim() || !activeTopic || !socket || !currentUser) return;
                            const message = {
                              topicId: activeTopic.id,
                              userId: currentUser.uid,
                              userName: currentUser.displayName,
                              userHashtag: currentUser.hashtag,
                              text: coworkingInput,
                              timestamp: Date.now()
                            };
                            socket.emit('send-message', { topicId: activeTopic.id, message });
                            setCoworkingInput('');
                          }}
                          className="flex items-center gap-2"
                        >
                          <input 
                            type="text"
                            value={coworkingInput}
                            onChange={(e) => setCoworkingInput(e.target.value)}
                            placeholder={t('Type a message...')}
                            className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
                          />
                          <button 
                            type="submit"
                            className="p-2 rounded-xl bg-orange-500 text-black hover:bg-orange-400 transition-colors"
                          >
                            <Icons.Send size={20} />
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 mb-6">
                        <Icons.MessageSquare size={40} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Bienvenido al Coworking</h3>
                      <p className="text-zinc-500 max-w-md">Selecciona un tema de la izquierda para empezar a colaborar con otros usuarios en tiempo real.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {workMode === 'admin' && currentUser?.isAdmin && (
            <div className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden">
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-[#0F0F0F]">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <Icons.ShieldCheck size={28} className="text-emerald-400" />
                    {t('Admin Panel')}
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">Gestiona usuarios, suscripciones y contenido de la plataforma.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-zinc-900 p-1 rounded-xl border border-white/5">
                    <button 
                      onClick={() => setAdminTab('users')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'users' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Usuarios
                    </button>
                    <button 
                      onClick={() => setAdminTab('news')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'news' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Noticias
                    </button>
                    <button 
                      onClick={() => setAdminTab('subs')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'subs' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Suscripciones
                    </button>
                    <button 
                      onClick={() => setAdminTab('content')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${adminTab === 'content' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      Contenido
                    </button>
                  </div>
                  <div className="bg-zinc-900 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Icons.Users size={18} />
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase font-bold">Usuarios Totales</div>
                      <div className="text-lg font-bold text-white">{allUsers.length + 1}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <AnimatePresence mode="wait">
                  {adminTab === 'news' && (
                    <motion.div 
                      key="news"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Icons.Newspaper size={20} className="text-emerald-400" />
                          Noticias y Actualizaciones
                        </h3>
                        <button 
                          onClick={() => setShowNewsModal(true)}
                          className="text-xs bg-emerald-500 text-black px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-400 transition-colors"
                        >
                          Publicar Noticia
                        </button>
                      </div>
                      <div className="flex flex-col gap-4">
                        {news.map(item => (
                          <div key={item.id} className="bg-zinc-950 border border-white/10 rounded-xl p-4 group">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-bold text-white">{item.title}</h4>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'news', item.id));
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `news/${item.id}`);
                                  }
                                }} className="text-red-400 hover:text-red-300">
                                  <Icons.Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-zinc-400 leading-relaxed">{item.content}</p>
                            <div className="text-[10px] text-zinc-600 mt-3 font-mono">
                              {new Date(item.date).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'users' && (
                    <motion.div 
                      key="users"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <Icons.UserCog size={20} className="text-emerald-400" />
                        {t('User Management')}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-zinc-500 border-b border-white/10">
                              <th className="pb-3 font-medium">Usuario</th>
                              <th className="pb-3 font-medium">Estado</th>
                              <th className="pb-3 font-medium">Prompts</th>
                              <th className="pb-3 font-medium text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            <tr className="group">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                  <div>
                                    <div className="font-medium text-white">{currentUser?.email}</div>
                                    <div className="text-[10px] text-emerald-400 uppercase font-bold">Admin / Creador</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Activo</span>
                              </td>
                              <td className="py-4 text-zinc-400">∞</td>
                              <td className="py-4 text-right">
                                <span className="text-zinc-600 italic text-xs">Propietario</span>
                              </td>
                            </tr>
                            {/* Mock users for demonstration */}
                            {[1, 2, 3].map(i => (
                              <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                                <td className="py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-zinc-800" />
                                    <div>
                                      <div className="font-medium text-white">usuario_{i}@ejemplo.com</div>
                                      <div className="text-[10px] text-zinc-500 uppercase font-bold">{t('Standard User')}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4">
                                  <span className="bg-zinc-800 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full">Gratis</span>
                                </td>
                                <td className="py-4 text-zinc-400">0/2</td>
                                <td className="py-4 text-right">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title={t('Gift Subscription')}>
                                      <Icons.Gift size={16} />
                                    </button>
                                    <button className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title={t('Block User')}>
                                      <Icons.UserX size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'subs' && (
                    <motion.div 
                      key="subs"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.CreditCard size={18} className="text-emerald-400" />
                          {t('Free Tier')}
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$0 <span className="text-sm text-zinc-500 font-normal">/{t('month')}</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> 10 {t('daily prompts')}</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Basic access')}</li>
                          <li className="flex items-center gap-2"><Icons.X size={14} className="text-red-400" /> {t('No Magic Enhance')}</li>
                        </ul>
                        <button className="w-full py-2 bg-zinc-800 text-white rounded-xl text-xs font-bold hover:bg-zinc-700 transition-colors">{t('Configure')}</button>
                      </div>
                      <div className="bg-zinc-900/50 border border-emerald-500/30 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[10px] font-bold px-3 py-1 rounded-bl-xl">{t('POPULAR')}</div>
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.Zap size={18} className="text-emerald-400" />
                          {t('Pro Tier')}
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$9.99 <span className="text-sm text-zinc-500 font-normal">/{t('month')}</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> 100 {t('daily prompts')}</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Magic Enhance')}</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Sin anuncios')}</li>
                        </ul>
                        <button className="w-full py-2 bg-emerald-500 text-black rounded-xl text-xs font-bold hover:bg-emerald-400 transition-colors">{t('Configure')}</button>
                      </div>
                      <div className="bg-zinc-900/50 border border-purple-500/30 rounded-2xl p-6">
                        <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                          <Icons.Crown size={18} className="text-purple-400" />
                          {t('Elite Tier')}
                        </h4>
                        <div className="text-3xl font-bold text-white mb-2">$24.99 <span className="text-sm text-zinc-500 font-normal">/{t('month')}</span></div>
                        <ul className="text-sm text-zinc-400 space-y-2 mb-6">
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Unlimited prompts')}</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Priority support')}</li>
                          <li className="flex items-center gap-2"><Icons.Check size={14} className="text-emerald-400" /> {t('Early access')}</li>
                        </ul>
                        <button className="w-full py-2 bg-purple-500 text-white rounded-xl text-xs font-bold hover:bg-purple-400 transition-colors">{t('Configure')}</button>
                      </div>
                    </motion.div>
                  )}

                  {adminTab === 'content' && (
                    <motion.div 
                      key="content"
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6"
                    >
                      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <Icons.Image size={20} className="text-emerald-400" />
                        {t('Content Moderation')}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                          <div key={i} className="aspect-square bg-zinc-950 rounded-xl border border-white/10 overflow-hidden relative group">
                            <img src={`https://picsum.photos/seed/content-${i}/300/300`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <button className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-colors">
                                <Icons.Trash2 size={18} />
                              </button>
                              <button className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 transition-colors">
                                <Icons.Check size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                      <Icons.Sliders size={20} className="text-emerald-400" />
                      Controles de Plataforma
                    </h3>
                    <div className="flex flex-col gap-4">
                      <div className="p-4 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">Mantenimiento Global</div>
                          <div className="text-xs text-zinc-500">Bloquea el acceso a todos los usuarios</div>
                        </div>
                        <button className="w-10 h-5 bg-zinc-800 rounded-full relative">
                          <div className="absolute top-1 left-1 w-3 h-3 bg-zinc-600 rounded-full" />
                        </button>
                      </div>
                      <div className="p-4 bg-zinc-950 border border-white/10 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="text-sm font-bold text-white">Nuevas Funciones (Spoilers)</div>
                          <div className="text-xs text-zinc-500">{t('Shows tabs under construction')}</div>
                        </div>
                        <button className="w-10 h-5 bg-emerald-500 rounded-full relative">
                          <div className="absolute top-1 right-1 w-3 h-3 bg-white rounded-full" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Icons.Info size={20} className="text-emerald-400" />
                      Estado del Sistema
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">{t('App Version')}</span>
                        <span className="text-zinc-300">v2.4.0-beta</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Base de Datos</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Conectado (Firebase)
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">API Gemini</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Activa
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Copilot & Banned Words */}
        {(workMode === 'prompting' || workMode === 'influencer') && (
          <>
            {/* Mobile Backdrop */}
            <AnimatePresence>
              {showRightSidebar && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowRightSidebar(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] md:hidden"
                />
              )}
            </AnimatePresence>
            
            {/* Desktop Sidebar Placeholder (for layout expansion) */}
            <div className={`hidden md:block transition-all duration-300 shrink-0 relative ${showRightSidebar ? 'w-72' : 'w-0'}`} />

            <aside className={`${showRightSidebar ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 fixed md:absolute right-0 top-0 bottom-0 w-72 border-l border-white/10 bg-[#0F0F0F] flex flex-col shrink-0 z-[150] md:z-40 h-full shadow-2xl`}>
              {/* Toggle Handle (Desktop only) */}
              <button 
                onClick={() => setShowRightSidebar(!showRightSidebar)}
                className="hidden md:flex absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 w-6 h-14 bg-[#0F0F0F] border border-white/10 border-r-0 rounded-l-xl items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all group z-50"
                title={showRightSidebar ? "Contraer sugerencias" : "Mostrar sugerencias"}
              >
                {showRightSidebar ? <Icons.ChevronRight size={16} /> : <Icons.ChevronLeft size={16} />}
              </button>
              
              {/* Mobile Close Button */}
              <div className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-sm font-bold text-white">Copiloto</span>
                <button onClick={() => setShowRightSidebar(false)} className="p-2 text-zinc-400 hover:text-white">
                  <Icons.X size={20} />
                </button>
              </div>
              
              {/* Banned Words Section */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <Icons.ShieldAlert size={14} />
                Banned Words
              </h2>
              <button 
                onClick={() => setIsBannedWordsLocked(!isBannedWordsLocked)}
                className={`p-1.5 rounded-md transition-colors ${isBannedWordsLocked ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-red-400 bg-red-400/10'}`}
              >
                {isBannedWordsLocked ? <Icons.Plus size={14} /> : <Icons.Lock size={14} />}
              </button>
            </div>
            
            {!isBannedWordsLocked && (
              <form onSubmit={handleAddBannedWord} className="mb-3 flex gap-2">
                <input 
                  type="text"
                  value={bannedWordInput}
                  onChange={e => setBannedWordInput(e.target.value)}
                  placeholder={t('e.g. baby, child...')}
                  className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-red-400/50"
                />
                <button type="submit" className="bg-zinc-800 text-zinc-300 px-2 rounded hover:bg-zinc-700">
                  <Icons.Plus size={14} />
                </button>
              </form>
            )}
            
            <div className="flex flex-wrap gap-1">
              {bannedWords.map(word => (
                <span key={word} className="bg-red-900/20 text-red-300/70 border border-red-900/30 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  {word}
                  {!isBannedWordsLocked && (
                    <button onClick={() => removeBannedWord(word)} className="hover:text-red-300">
                      <Icons.X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {bannedWords.length === 0 && isBannedWordsLocked && (
                <span className="text-zinc-600 text-xs italic">No banned words.</span>
              )}
            </div>
          </div>

          {/* Copilot Suggestions */}
          <div className="p-4 border-b border-white/10 flex items-center gap-2 text-emerald-400">
            <Icons.Lightbulb size={16} />
            <h2 className="text-sm font-medium">Sugerencias para tu Prompt</h2>
          </div>
          
          <div className="flex-1 p-4 pb-8 overflow-y-auto custom-scrollbar">
            {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
              <div className="text-zinc-500 text-sm text-center mt-10">
                Construye tu escena para recibir sugerencias contextuales.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sugerencias para tu escena</h3>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setSuggestionPage(p => Math.max(0, p - 1))}
                        disabled={suggestionPage === 0}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                      >
                        <Icons.ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] text-zinc-500 font-mono">{suggestionPage + 1}/{Math.max(1, totalSuggestionPages)}</span>
                      <button 
                        onClick={() => setSuggestionPage(p => Math.min(totalSuggestionPages - 1, p + 1))}
                        disabled={suggestionPage >= totalSuggestionPages - 1}
                        className="p-1 text-zinc-500 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                      >
                        <Icons.ChevronRight size={14} />
                      </button>
                      <button 
                        onClick={handleRefreshSuggestions}
                        className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors ml-1"
                      >
                        <Icons.RefreshCw size={12} />
                      </button>
                    </div>
                  </div>
                  {isSuggesting ? (
                    <div className="flex items-center justify-center py-8 text-zinc-500">
                      <Icons.Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : currentSuggestions.length > 0 ? (
                     <div className="flex flex-col gap-2">
                      <AnimatePresence mode="popLayout">
                        {currentSuggestions.map(block => (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            key={block.id}
                          >
                            <button
                              onClick={() => toggleBlock(block)}
                              className="w-full text-left p-2 rounded-lg bg-zinc-900 border border-white/5 hover:border-emerald-500/30 hover:bg-zinc-800 transition-all group flex items-start justify-between"
                            >
                              <div>
                                <div className="text-[10px] text-emerald-400/80 mb-0.5">{t(ALL_CATEGORIES.find(c => c.id === block.categoryId)?.label || '')}</div>
                                <div className="text-xs text-zinc-200">{t(block.label)}</div>
                              </div>
                              <Icons.Plus size={14} className="text-zinc-500 group-hover:text-emerald-400 mt-1" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="text-zinc-500 text-sm">{t('No new suggestions for now.')}</div>
                  )}
                </div>
              </div>
            )}
          </div>
          </aside>
        </>
      )}
      </main>

      {/* History Modal */}
      {/* Save History Modal */}
      <AnimatePresence>
        {showSaveHistoryModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Save size={20} className="text-emerald-400" />
                  Save to Library
                </h2>
                <button onClick={() => setShowSaveHistoryModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-zinc-300">Prompt Title</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={saveHistoryTitle}
                      onChange={e => setSaveHistoryTitle(e.target.value)}
                      placeholder={t('e.g. Cyberpunk Neon Portrait')}
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500/50"
                      autoFocus
                    />
                    <button 
                      onClick={generateHistoryTitle}
                      disabled={isGeneratingHistoryTitle}
                      className="px-3 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
                      title={t('Suggest title')}
                    >
                      {isGeneratingHistoryTitle ? <Icons.Loader2 size={18} className="animate-spin" /> : <Icons.Wand2 size={18} />}
                    </button>
                  </div>
                </div>
                <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3">
                  <p className="text-xs text-zinc-500 font-mono line-clamp-3">{compiledPrompt}</p>
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowSaveHistoryModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmSaveHistory}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0A0A0A]">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 whitespace-nowrap">
                    <Icons.BookMarked size={20} className="text-emerald-400" />
                    My Library
                  </h2>
                  <div className="relative flex-1 max-w-md">
                    <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={blockSearch} // Reuse blockSearch for history search
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder={t('Search in library...')}
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => setShowRecycleBin(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    <Icons.Trash2 size={14} />
                    Trash
                  </button>
                  <select 
                    value={historySort}
                    onChange={(e) => setHistorySort(e.target.value as any)}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all cursor-pointer flex-1 md:flex-none"
                  >
                    <option value="date">Date</option>
                    <option value="title">Title</option>
                  </select>
                  <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white p-1">
                    <Icons.X size={20} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-4">
                {promptHistory.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-zinc-500">
                    You haven't saved any prompts yet.
                  </div>
                ) : (
                  promptHistory
                    .filter(session => {
                      const searchLower = blockSearch.toLowerCase();
                      return (session.title || '').toLowerCase().includes(searchLower) || session.compiledPrompt.toLowerCase().includes(searchLower);
                    })
                    .sort((a, b) => {
                      if (historySort === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
                      return (a.title || '').localeCompare(b.title || '');
                    })
                    .map(session => (
                    <div key={session.id} className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group relative">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {editingHistoryId === session.id ? (
                            <input 
                              type="text"
                              value={editingHistoryTitle}
                              onChange={e => setEditingHistoryTitle(e.target.value)}
                              onBlur={() => renameHistoryItem(session.id, editingHistoryTitle)}
                              onKeyDown={e => e.key === 'Enter' && renameHistoryItem(session.id, editingHistoryTitle)}
                              className="w-full bg-zinc-950 border border-emerald-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <h3 
                              className="text-sm font-medium text-white truncate cursor-pointer hover:text-emerald-400 transition-colors"
                              onClick={() => {
                                setEditingHistoryId(session.id);
                                setEditingHistoryTitle(session.title || '');
                              }}
                              title={t('Click to rename')}
                            >
                              {session.title || t('Untitled Prompt')}
                            </h3>
                          )}
                          <span className="text-[10px] text-zinc-500 block mt-0.5">{new Date(session.date).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            onClick={() => {
                              setShareTitle(session.title || '');
                              setSharePrompt(session.compiledPrompt);
                              setShowShareModal(true);
                            }}
                            className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                            title={t('Share to Community')}
                          >
                            <Icons.Share2 size={14} />
                          </button>
                          <button 
                            onClick={() => toggleFavorite(session.id)}
                            className={`p-1 ${session.isFavorite ? 'text-yellow-400' : 'text-zinc-500 hover:text-yellow-400/50'} transition-colors`}
                          >
                            <Icons.Star size={14} fill={session.isFavorite ? "currentColor" : "none"} />
                          </button>
                          <button 
                            onClick={() => deleteHistoryItem(session.id)}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            title={t('Delete')}
                          >
                            <Icons.Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 font-mono line-clamp-3 leading-relaxed bg-zinc-950/50 p-2 rounded-lg border border-white/5">
                        {session.compiledPrompt}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-auto pt-2">
                        {(Array.isArray(session.selectedBlocks) ? session.selectedBlocks : []).slice(0, 3).map(b => (
                          <span key={b.id} className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            {b.label}
                          </span>
                        ))}
                        {Array.isArray(session.selectedBlocks) && session.selectedBlocks.length > 3 && (
                          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            +{session.selectedBlocks.length - 3} {t('more')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => loadSession(session)}
                          className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Icons.RefreshCw size={12} /> Reutilizar
                        </button>
                        <button 
                          onClick={() => handleCopyPrompt(session.compiledPrompt)}
                          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                        >
                          <Icons.Copy size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NSFW Warning Modal */}
      <AnimatePresence>
        {showNsfwWarning && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-red-500/30 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-red-500/20 bg-red-500/5 flex items-center gap-3">
                <Icons.AlertTriangle className="text-red-400" size={24} />
                <h2 className="text-lg font-semibold text-white">{t('Sensitive Content')}</h2>
              </div>
              <div className="p-6 text-zinc-300 text-sm leading-relaxed">
                <p className="mb-4">
                  {t('You are trying to add a block that contains explicit or sensitive material (NSFW).')}
                </p>
                <p>
                  {t('To use these blocks, you need to enable the "NSFW Allowed" switch at the top of the workspace.')}
                </p>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowNsfwWarning(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Got it')}
                </button>
                <button 
                  onClick={() => {
                    setIsNsfwEnabled(true);
                    setShowNsfwWarning(false);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 transition-colors"
                >
                  Habilitar NSFW
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ver Más Modal */}
      <AnimatePresence>
        {showMoreCategory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0A0A0A]">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2 whitespace-nowrap">
                    <div className={getCategoryColor(showMoreCategory)}>{renderIcon(ALL_CATEGORIES.find(c => c.id === showMoreCategory)?.icon || '')}</div>
                    {ALL_CATEGORIES.find(c => c.id === showMoreCategory)?.label}
                  </h2>
                  <div className="relative flex-1 max-w-md">
                    <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text"
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                      placeholder={t('Search subcategory...')}
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
                <button onClick={() => setShowMoreCategory(null)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="flex flex-wrap gap-3">
                  {activeBlocks.filter(b => {
                    const matchesCategory = b.categoryId === showMoreCategory;
                    const searchLower = blockSearch.toLowerCase();
                    return matchesCategory && (b.label.toLowerCase().includes(searchLower) || b.value.toLowerCase().includes(searchLower));
                  })
                    .sort((a, b) => {
                      const aFav = favoriteBlocks.includes(a.id);
                      const bFav = favoriteBlocks.includes(b.id);
                      if (aFav && !bFav) return -1;
                      if (!aFav && bFav) return 1;
                      return 0;
                    })
                    .map(block => {
                    const isSelected = selectedBlocks.some(b => b.id === block.id);
                    const isFav = favoriteBlocks.includes(block.id);
                    return (
                      <div key={block.id} className="relative group">
                        <button
                          onClick={() => toggleBlock(block)}
                          onMouseEnter={() => setHoveredBlock(block.id)}
                          onMouseLeave={() => setHoveredBlock(null)}
                          className={`px-4 py-2 rounded-xl text-sm border transition-all text-left flex items-center gap-2 group ${
                            isSelected 
                              ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800'
                          }`}
                        >
                          <div 
                            onClick={(e) => toggleFavoriteBlock(block.id, e)}
                            className={`p-1 rounded-full transition-colors ${isFav ? 'text-red-400' : 'text-zinc-600 hover:text-red-400/50'}`}
                          >
                            <Icons.Heart size={14} fill={isFav ? "currentColor" : "none"} />
                          </div>
                          {t(block.label)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Modal */}
      <AnimatePresence>
        {showComparisonModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.GitMerge size={20} className="text-emerald-400" />
                  {t('Integrate Recreation')}
                </h2>
                <button onClick={() => setShowComparisonModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-zinc-400">{t('Current Prompt (Prompting)')}</h3>
                    <div className="bg-zinc-900 border border-white/5 rounded-xl p-4 text-sm text-zinc-300 min-h-[150px]">
                      {compiledPrompt || <span className="text-zinc-600 italic">{t('No current prompt...')}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-emerald-400">{t('Extracted Prompt (Recreation)')}</h3>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-300 min-h-[150px]">
                      {extractedPrompt}
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">{t('Integration Options')}</h3>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: t('Image Recreation'),
                          value: extractedPrompt || '',
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks(prev => [...prev, newBlock]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-white/5 bg-zinc-800 hover:bg-zinc-700 hover:border-white/20 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 group-hover:text-white transition-colors">
                        <Icons.Plus size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white mb-1">{t('Add (Combine)')}</div>
                        <div className="text-xs text-zinc-400">{t('Adds the extracted prompt as a new block in the Scene Structure. The AI will mix it with your current prompt.')}</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: t('Recreation Details'),
                          value: `Secondary image details: ${extractedPrompt}`,
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks(prev => [...prev, newBlock]);
                        setCustomInstructions(prev => [...prev, `Prioritize my current prompt, but add details that do not conflict from the Recreation Details block.`]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-white/5 bg-zinc-800 hover:bg-zinc-700 hover:border-white/20 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 group-hover:text-white transition-colors">
                        <Icons.Shield size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white mb-1">{t('Use Final Prompt parameters')}</div>
                        <div className="text-xs text-zinc-400">{t('Adds the image as a secondary block. Maintains your current structure and only adds details that do not contradict what you already chose.')}</div>
                      </div>
                    </button>

                    <button 
                      onClick={() => {
                        const newBlock: Block = {
                          id: `recreation-${Date.now()}`,
                          categoryId: 'custom',
                          label: t('Exact Recreation'),
                          value: extractedPrompt || '',
                          isCustom: true
                        };
                        setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                        setSelectedBlocks([newBlock]);
                        setCustomInstructions([`Recreate this image exactly based on the Exact Recreation block.`]);
                        setShowComparisonModal(false);
                        setWorkMode('prompting');
                      }}
                      className="w-full text-left p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all flex items-start gap-4 group"
                    >
                      <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">
                        <Icons.Image size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-emerald-400 mb-1">{t('Use Recreation parameters')}</div>
                        <div className="text-xs text-emerald-500/70">{t('Completely replaces your current structure with a single block containing the description of the uploaded image.')}</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clean Modal */}
      <AnimatePresence>
        {showCleanModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Eraser size={20} className="text-emerald-400" />
                  {t('Clean Prompt')}
                </h2>
                <button onClick={() => setShowCleanModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">{t('Select the elements you want to remove from the extracted prompt:')}</p>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'tattoos', label: t('Tattoos') },
                    { id: 'piercings', label: t('Piercings') },
                    { id: 'hair', label: t('Hair details (color, style)') },
                    { id: 'facial', label: t('Specific facial features') },
                    { id: 'clothing', label: t('Specific clothing') },
                    { id: 'background', label: t('Background / Environment') }
                  ].map(option => (
                    <label key={option.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-zinc-900/50 hover:bg-zinc-800 cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={cleanOptions.includes(option.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCleanOptions(prev => [...prev, option.id]);
                          } else {
                            setCleanOptions(prev => prev.filter(id => id !== option.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-white/20 bg-black/50 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
                      />
                      <span className="text-sm text-zinc-300">{option.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <button 
                    onClick={() => {
                      if (cleanOptions.length === 6) {
                        setCleanOptions([]);
                      } else {
                        setCleanOptions(['tattoos', 'piercings', 'hair', 'facial', 'clothing', 'background']);
                      }
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {cleanOptions.length === 6 ? t('Deselect All') : t('Select All')}
                  </button>
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowCleanModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={async () => {
                    if (!originalRecreationPrompt) {
                      setOriginalRecreationPrompt(extractedPrompt);
                    }
                    
                    setIsCleaningPrompt(true);
                    try {
                      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
                      const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: `Clean the following image prompt by removing any mention of the following elements: ${cleanOptions.join(', ')}.
                        
                        Original Prompt: "${extractedPrompt}"
                        
                        Return ONLY the clean prompt in the same language as the original, without introductions or explanations. Ensure that the grammar remains correct after removing the elements.`,
                      });
                      
                      setExtractedPrompt(response.text || extractedPrompt);
                    } catch (error) {
                      console.error("Error cleaning prompt:", error);
                      // Fallback to basic string replacement if AI fails
                      let newPrompt = extractedPrompt;
                      if (cleanOptions.includes('tattoos')) newPrompt = newPrompt?.replace(/tattoos?,|tattooed,/gi, '') || null;
                      if (cleanOptions.includes('piercings')) newPrompt = newPrompt?.replace(/piercings?,|pierced,/gi, '') || null;
                      setExtractedPrompt(newPrompt);
                    } finally {
                      setIsCleaningPrompt(false);
                      setShowCleanModal(false);
                      setCleanOptions([]);
                    }
                  }}
                  disabled={cleanOptions.length === 0 || isCleaningPrompt}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors flex items-center gap-2"
                >
                  {isCleaningPrompt ? <Icons.Loader2 size={16} className="animate-spin" /> : null}
                  {isCleaningPrompt ? t('Cleaning...') : t('Clean')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Upload size={20} className="text-emerald-400" />
                  {t('Share Prompt')}
                </h2>
                <button onClick={() => setShowShareModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">{t('Prompt Title:')}</label>
                  <input 
                    type="text" 
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    placeholder={t('Ex: Cyberpunk Neon Portrait')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">{t('Prompt (English):')}</label>
                  <textarea 
                    value={sharePrompt}
                    onChange={(e) => setSharePrompt(e.target.value)}
                    placeholder={t('The prompt you want to share...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[100px] resize-none font-mono"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-400">{t('Example Image URL (Optional):')}</label>
                  <input 
                    type="text" 
                    value={shareImage}
                    onChange={(e) => setShareImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={() => {
                    if (shareTitle && sharePrompt) {
                      setCommunityFeed([{
                        id: Date.now().toString(),
                        title: shareTitle,
                        prompt: sharePrompt,
                        user: t('You'),
                        image: shareImage || `https://picsum.photos/seed/${shareTitle.replace(/\s+/g, '')}/100/100`
                      }, ...communityFeed]);
                      setShowShareModal(false);
                      setShareTitle('');
                      setSharePrompt('');
                      setShareImage('');
                    }
                  }}
                  disabled={!shareTitle || !sharePrompt}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-colors"
                >
                  {t('Publish')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Post Modal */}
      <AnimatePresence>
        {expandedPost && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setExpandedPost(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="md:w-1/2 bg-black relative">
                <img src={expandedPost.image} alt={expandedPost.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setExpandedPost(null)} 
                  className="absolute top-4 left-4 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 p-2 rounded-full backdrop-blur-md transition-all md:hidden"
                >
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="md:w-1/2 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-white mb-2">{expandedPost.title}</h2>
                    <button 
                      onClick={() => {
                        setExpandedPost(null);
                        setSelectedUser(expandedPost.user);
                        setShowUserProfileModal(true);
                      }}
                      className="flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 transition-colors"
                    >
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
                        <Icons.User size={12} />
                      </div>
                      {expandedPost.user}
                    </button>
                  </div>
                  <button onClick={() => setExpandedPost(null)} className="text-zinc-400 hover:text-white p-1 hidden md:block">
                    <Icons.X size={24} />
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col gap-4 mt-4">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-2">
                      <Icons.Terminal size={16} className="text-emerald-400" />
                      Prompt
                    </h3>
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 text-sm text-zinc-300 font-mono leading-relaxed">
                      {expandedPost.prompt}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => handleCopyPrompt(expandedPost.prompt)}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icons.Copy size={18} /> {t('Copy Prompt')}
                  </button>
                  <button 
                    onClick={() => {
                      setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                      setCustomInstructions([expandedPost.prompt]);
                      setSelectedBlocks([]);
                      setWorkMode('prompting');
                      setExpandedPost(null);
                    }}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Icons.Wand2 size={18} /> {t('Use Prompt')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {showUserProfileModal && selectedUser && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden shadow-2xl max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl text-emerald-400 font-bold">
                    {selectedUser.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selectedUser}</h2>
                    <p className="text-sm text-zinc-400">{t('Prompt Book')}</p>
                  </div>
                </div>
                <button onClick={() => setShowUserProfileModal(false)} className="text-zinc-400 hover:text-white p-2">
                  <Icons.X size={24} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {communityFeed.filter(post => post.user === selectedUser).map(post => (
                    <div key={post.id} className="bg-zinc-900 border border-white/5 rounded-xl overflow-hidden flex flex-col">
                      <div className="h-32 bg-zinc-800 relative overflow-hidden">
                        <img src={post.image} alt={post.title} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <h3 className="font-semibold text-white text-sm truncate">{post.title}</h3>
                        </div>
                      </div>
                      <div className="p-3 flex flex-col gap-2 flex-1">
                        <p className="text-xs text-zinc-400 font-mono line-clamp-2 flex-1">
                          {post.prompt}
                        </p>
                        <div className="flex justify-end pt-2 border-t border-white/5">
                          <button 
                            onClick={() => {
                              setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                              setCustomInstructions([post.prompt]);
                              setSelectedBlocks([]);
                              setShowUserProfileModal(false);
                              setWorkMode('prompting');
                            }}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                          >
                            <Icons.ArrowRight size={14} /> {t('Use Prompt')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {communityFeed.filter(post => post.user === selectedUser).length === 0 && (
                    <div className="col-span-full py-8 text-center text-zinc-500">
                      {t('This user hasn\'t shared any prompts yet.')}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coworking Create Topic Modal */}
      <AnimatePresence>
        {showCreateTopicModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.PlusCircle size={20} className="text-orange-400" />
                  {t('Create New Topic')}
                </h2>
                <button onClick={() => setShowCreateTopicModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Topic Title')}</label>
                  <input 
                    type="text" 
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    placeholder={t('Ex: Futuristic Project, Rain Session...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Description')}</label>
                  <textarea 
                    value={newTopicDescription}
                    onChange={(e) => setNewTopicDescription(e.target.value)}
                    placeholder={t('Brief description of what will be discussed...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all resize-none h-24"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowCreateTopicModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={() => {
                    if (!newTopicTitle.trim() || !socket || !currentUser) return;
                    const topic = {
                      id: Date.now().toString(),
                      title: newTopicTitle,
                      description: newTopicDescription,
                      createdBy: currentUser.uid,
                      members: [currentUser.uid],
                      timestamp: Date.now()
                    };
                    socket.emit('create-topic', topic);
                    setShowCreateTopicModal(false);
                    setNewTopicTitle('');
                    setNewTopicDescription('');
                  }}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-orange-500 text-black hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
                >
                  {t('Create Topic')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coworking Invite Modal */}
      <AnimatePresence>
        {showNewsModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Newspaper size={20} className="text-emerald-400" />
                  {t('Publish News')}
                </h2>
                <button onClick={() => setShowNewsModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Title')}</label>
                  <input 
                    type="text" 
                    value={newNewsTitle}
                    onChange={(e) => setNewNewsTitle(e.target.value)}
                    placeholder={t('News title...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Content')}</label>
                  <textarea 
                    value={newNewsContent}
                    onChange={(e) => setNewNewsContent(e.target.value)}
                    placeholder={t('Write the content here...')}
                    rows={4}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all resize-none"
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowNewsModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={async () => {
                    if (newNewsTitle && newNewsContent && currentUser) {
                      const newNewsItem: NewsItem = {
                        id: Date.now().toString(),
                        title: newNewsTitle,
                        content: newNewsContent,
                        date: Date.now(),
                        type: 'update',
                        authorId: currentUser.uid,
                        isPublished: true
                      };
                      try {
                        await setDoc(doc(db, 'news', newNewsItem.id), newNewsItem);
                        setShowNewsModal(false);
                        setNewNewsTitle('');
                        setNewNewsContent('');
                      } catch (error) {
                        handleFirestoreError(error, OperationType.CREATE, `news/${newNewsItem.id}`);
                      }
                    }
                  }}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  {t('Publish')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInviteModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.UserPlus size={20} className="text-orange-400" />
                  {t('Invite to Topic')}
                </h2>
                <button onClick={() => setShowInviteModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">{t('Enter email or unique user (Name#1234) to invite.')}</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Email or User#Hashtag')}</label>
                  <input 
                    type="text" 
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder={t('Ex: user@gmail.com or Name#1234')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={() => handleInviteUser(inviteInput)}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-orange-500 text-black hover:bg-orange-400 transition-colors shadow-lg shadow-orange-500/20"
                >
                  {t('Send Invitation')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Bust Size Modal */}
      <AnimatePresence>
        {showBustModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.User size={20} className="text-rose-400" />
                  {t('Bust Measurement')}
                </h2>
                <button onClick={() => setShowBustModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">{t('Specify bust measurement or "Bra Cup" for better body consistency.')}</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Bra Cup / Measurement')}</label>
                  <input 
                    type="text" 
                    value={bustSize}
                    onChange={(e) => setBustSize(e.target.value)}
                    placeholder={t('Ex: 34C, Large, DD cup...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-rose-500/50 transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmBustSize()}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowBustModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={confirmBustSize}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-400 transition-colors shadow-lg shadow-rose-500/20"
                >
                  {t('Confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smartphone Modal */}
      <AnimatePresence>
        {showSmartphoneModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Icons.Smartphone size={20} className="text-emerald-400" />
                  {t('Smartphone Details')}
                </h2>
                <button onClick={() => setShowSmartphoneModal(false)} className="text-zinc-400 hover:text-white p-1">
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm text-zinc-400">{t('What smartphone model would you like to appear in the prompt?')}</p>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">{t('Model / Brand')}</label>
                  <input 
                    type="text" 
                    value={smartphoneModel}
                    onChange={(e) => setSmartphoneModel(e.target.value)}
                    placeholder={t('Ex: iPhone 15 Pro Max, Samsung S24 Ultra...')}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && confirmSmartphoneModel()}
                  />
                </div>
              </div>
              <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#0A0A0A]">
                <button 
                  onClick={() => setShowSmartphoneModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={confirmSmartphoneModel}
                  className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  {t('Confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

        {showRecycleBin && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
                    <Icons.Trash2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{t('Recycle Bin')}</h3>
                    <p className="text-xs text-zinc-500">{t('Recover accidentally deleted prompts.')}</p>
                  </div>
                </div>
                <button onClick={() => setShowRecycleBin(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {deletedPrompts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                    <Icons.Trash2 size={48} className="mb-4 opacity-20" />
                    <p>{t('The bin is empty')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {deletedPrompts.map(session => (
                      <div key={session.id} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 group">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-white text-sm">{session.title || t('Untitled Prompt')}</h4>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={async () => {
                                try {
                                  await setDoc(doc(db, 'prompts', session.id), session);
                                  setDeletedPrompts(prev => prev.filter(p => p.id !== session.id));
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.CREATE, `prompts/${session.id}`);
                                }
                              }}
                              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title={t('Restore')}
                            >
                              <Icons.RotateCcw size={16} />
                            </button>
                            <button 
                              onClick={() => setDeletedPrompts(prev => prev.filter(p => p.id !== session.id))}
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title={t('Delete permanently')}
                            >
                              <Icons.Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-2 font-mono bg-black/30 p-2 rounded-lg">
                          {session.compiledPrompt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {deletedPrompts.length > 0 && (
                <div className="p-4 border-t border-white/10 bg-zinc-900/50 flex justify-end">
                  <button 
                    onClick={() => {
                      showConfirm(
                        t('Empty Bin'),
                        t('Are you sure you want to empty the bin? This action cannot be undone.'),
                        () => setDeletedPrompts([])
                      );
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-bold px-4 py-2"
                  >
                    {t('Empty Bin')}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showSessionHistory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.History size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Session History</h3>
                    <p className="text-xs text-zinc-500">Prompts generated in this session. They will be cleared when you close the app.</p>
                  </div>
                </div>
                <button onClick={() => setShowSessionHistory(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {sessionHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
                    <Icons.History size={48} className="mb-4 opacity-20" />
                    <p>No history in this session yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {sessionHistory.map((entry, idx) => (
                      <div key={idx} className="bg-zinc-950 border border-white/5 rounded-2xl p-4 group hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setUndoStack(prev => [...prev, { blocks: selectedBlocks, instructions: customInstructions }]);
                                setCompiledPrompt(entry.prompt);
                                setPromptSegments([{ text: entry.prompt, categoryId: 'custom' }]);
                                setIsEditingPrompt(true);
                                setShowSessionHistory(false);
                              }}
                              className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title={t('Restore this prompt')}
                            >
                              <Icons.RotateCcw size={16} />
                            </button>
                            <button 
                              onClick={() => handleCopyPrompt(entry.prompt)}
                              className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                              title={t('Copy')}
                            >
                              <Icons.Copy size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-3 font-mono bg-black/30 p-3 rounded-xl border border-white/5">
                          {entry.prompt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-white/10 bg-zinc-900/50 flex justify-end">
                <button 
                  onClick={() => setSessionHistory([])}
                  className="text-xs text-red-400 hover:text-red-300 font-bold px-4 py-2"
                >
                  Clear Session History
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSaveStyleModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.Bookmark size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{t('Save Style')}</h3>
                    <p className="text-xs text-zinc-500">{t('Save this prompt as a reusable style')}</p>
                  </div>
                </div>
                <button onClick={() => setShowSaveStyleModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">{t('Style Name')}</label>
                  <input 
                    type="text" 
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    placeholder={t('Ex: Cyberpunk Neon, Realistic Portrait...')}
                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                    autoFocus
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">{t('What do you want to save from this recreation?')}</p>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => handleSaveStyle(styleName, 'full')}
                      className="p-4 bg-zinc-950 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{t('Everything in General')}</span>
                        <Icons.Layers size={16} className="text-zinc-600" />
                      </div>
                      <p className="text-[10px] text-zinc-500">{t('Save the full prompt as a base style.')}</p>
                    </button>
                    
                    <button 
                      onClick={() => handleSaveStyle(styleName, 'partial')}
                      className="p-4 bg-zinc-950 border border-white/5 rounded-2xl hover:border-emerald-500/30 transition-all text-left group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{t('Something Specific')}</span>
                        <Icons.Target size={16} className="text-zinc-600" />
                      </div>
                      <p className="text-[10px] text-zinc-500">{t('Save only key elements (lights, atmosphere, technique).')}</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/50 flex justify-end gap-3">
                <button 
                  onClick={() => setShowSaveStyleModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  {t('Cancel')}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden flex flex-col my-auto max-h-[95vh]"
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Icons.Settings size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">{t('Settings')}</h3>
                    <p className="text-[10px] text-zinc-500">{t('Personalize your SceneCraft AI experience')}</p>
                  </div>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-zinc-400">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
                {/* Account Settings */}
                <div className="flex items-center justify-between border-b border-white/10 pb-5">
                  <div>
                    <h4 className="text-xs font-bold text-white">
                      {currentUser ? `${t('Hi')}, ${currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}` : t('Account')}
                    </h4>
                    <p className="text-[10px] text-zinc-500">
                      {currentUser ? `${t('Connected as')} ${currentUser.email}` : t('Log in to save your progress')}
                    </p>
                    <div className="mt-2 flex items-center gap-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md w-fit">
                      <Icons.Zap size={10} className="text-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                        {currentUser?.plan === 'premium' || currentUser?.isSubscribed ? t('Premium Plan') : t('Free Plan')}
                      </span>
                    </div>
                  </div>
                  <div>
                    {currentUser && (
                      <button 
                        onClick={handleLogout}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-[10px] font-bold transition-colors"
                      >
                        {t('Log Out')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Theme Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Visual Theme')}</h4>
                    <p className="text-xs text-zinc-500">{t('Switch between dark and light mode')}</p>
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-white/5">
                    <button 
                      onClick={() => setTheme('dark')}
                      className={`px-3 py-1.5 rounded-md text-xs transition-all ${theme === 'dark' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                      {t('Dark')}
                    </button>
                    <button 
                      onClick={() => setTheme('light')}
                      className={`px-3 py-1.5 rounded-md text-xs transition-all ${theme === 'light' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                      {t('Light')}
                    </button>
                  </div>
                </div>

                {/* NSFW Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('NSFW Content')}</h4>
                    <p className="text-xs text-zinc-500">{t('Allow explicit blocks and terms')}</p>
                  </div>
                  <button 
                    onClick={() => setIsNsfwEnabled(!isNsfwEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isNsfwEnabled ? 'bg-red-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ left: isNsfwEnabled ? 26 : 2 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg" 
                    />
                  </button>
                </div>

                {/* Language Selection */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Interface Language')}</h4>
                    <p className="text-xs text-zinc-500">{t('Change the application language')}</p>
                  </div>
                  <select 
                    value={language}
                    onChange={(e) => {
                      const newLang = e.target.value;
                      setLanguage(newLang);
                      localStorage.setItem('scenecraft_language', newLang);
                    }}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Prompt Language')}</h4>
                    <p className="text-xs text-zinc-500">{t('Output language for generated prompts')}</p>
                  </div>
                  <select 
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value as 'es' | 'en')}
                    className="bg-zinc-950 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs text-emerald-400 focus:outline-none"
                  >
                    <option value="en">English (EN)</option>
                    <option value="es">Spanish (ES)</option>
                  </select>
                </div>

                {/* Manual Generation Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Manual Generation')}</h4>
                    <p className="text-xs text-zinc-500">{t('Enable manual editing of the final prompt')}</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newValue = !isManualGeneration;
                      setIsManualGeneration(newValue);
                      localStorage.setItem('scenecraft_manual_gen', JSON.stringify(newValue));
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isManualGeneration ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                  >
                    <motion.div 
                      animate={{ left: isManualGeneration ? 26 : 2 }}
                      className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg" 
                    />
                  </button>
                </div>

                {/* UI Style */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('UI Style')}</h4>
                    <p className="text-xs text-zinc-500">{t('Preset layouts for the platform')}</p>
                  </div>
                  <select 
                    value={uiStyle}
                    onChange={(e) => setUiStyle(e.target.value as any)}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="modern">{t('Modern (Default)')}</option>
                    <option value="glass">{t('Glassmorphism')}</option>
                    <option value="brutalist">{t('Brutalist')}</option>
                  </select>
                </div>

                {/* Color Theme */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{t('Accent Color')}</h4>
                    <p className="text-xs text-zinc-500">{t('Primary color of the interface')}</p>
                  </div>
                  <select 
                    value={colorTheme}
                    onChange={(e) => setColorTheme(e.target.value as any)}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    <option value="emerald">{t('Emerald (Default)')}</option>
                    <option value="blue">{t('Blue')}</option>
                    <option value="purple">{t('Purple')}</option>
                    <option value="rose">{t('Rose')}</option>
                    <option value="amber">{t('Amber')}</option>
                  </select>
                </div>

                {/* Account Actions */}
                <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
                  <button 
                    onClick={() => {
                      setShowSettings(false);
                    }}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {t('Save and Apply')}
                  </button>
                  {!currentUser && (
                    <button 
                      onClick={handleLogin}
                      className="w-full py-2.5 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      {t('Sign In with Google')}
                    </button>
                  )}
                </div>

                {/* Tutorial */}
                <div className="pt-4 border-t border-white/5">
                  <button 
                    onClick={() => {
                      setShowTutorial(true);
                      setShowSettings(false);
                    }}
                    className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Icons.HelpCircle size={16} /> {t('Restart Guided Tutorial')}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-zinc-950/50 text-center">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">SceneCraft AI v2.5 - 2026</p>
              </div>
            </motion.div>
          </div>
        )}

      {/* Expanded Scene Structure Modal */}
      <AnimatePresence>
        {isSceneStructureExpanded && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-4 md:p-10"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#0F0F0F] border border-white/10 rounded-3xl w-full max-w-5xl h-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#0A0A0A]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Icons.Layers size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{t('Scene Structure')}</h2>
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">{t('Detailed Block Management')}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSceneStructureExpanded(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <Icons.X size={24} />
                </button>
              </div>

              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                {selectedBlocks.length === 0 && customInstructions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                    <Icons.Layers size={48} className="opacity-20" />
                    <p className="italic">{t('No elements in the current scene.')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedBlocks.map(block => {
                      const cat = ALL_CATEGORIES.find(c => c.id === block.categoryId);
                      return (
                        <motion.div 
                          layout
                          key={block.id}
                          className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all"
                        >
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-bold uppercase tracking-tighter ${cat?.color || 'text-zinc-500'}`}>
                              {cat?.label ? t(cat.label) : t('Custom')}
                            </span>
                            <span className="text-sm text-white font-medium">{t(block.label)}</span>
                          </div>
                          <button 
                            onClick={() => toggleBlock(block)}
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          >
                            <Icons.Trash2 size={18} />
                          </button>
                        </motion.div>
                      );
                    })}
                    {customInstructions.map((inst, idx) => (
                      <motion.div 
                        layout
                        key={`expanded_inst_${idx}`}
                        className="bg-zinc-900/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-all"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-emerald-400">
                            {t('Chat Instruction')}
                          </span>
                          <span className="text-sm text-white font-medium line-clamp-2">{inst}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setEditingInstructionIndex(idx);
                              setEditingInstructionText(inst);
                              setShowEditInstructionModal(true);
                            }}
                            className="p-2 text-zinc-600 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
                          >
                            <Icons.Edit3 size={18} />
                          </button>
                          <button 
                            onClick={() => removeCustomInstruction(idx)}
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                          >
                            <Icons.Trash2 size={18} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-[#0A0A0A] border-t border-white/10 flex items-center justify-between">
                <div className="text-sm text-zinc-500">
                  <span className="text-emerald-400 font-bold">{selectedBlocks.length + customInstructions.length}</span> {t('active elements')}
                </div>
                <button 
                  onClick={() => {
                    setSelectedBlocks([]);
                    setCustomInstructions([]);
                    setIsSceneStructureExpanded(false);
                  }}
                  className="px-6 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl border border-red-500/20 transition-all"
                >
                  {t('Clear Scene')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }
      `}} />
      {/* Add Prompt Modal */}
      <AnimatePresence>
        {showAddPromptModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-lg font-bold text-white">{t('Add New Prompt')}</h2>
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mt-1">{t('Save your best creations')}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Title')}</label>
                  <input 
                    type="text"
                    value={newPromptTitle}
                    onChange={(e) => setNewPromptTitle(e.target.value)}
                    placeholder={t('Ex: Cyberpunk Portrait')}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('Prompt Content')}</label>
                  <textarea 
                    value={newPromptContent}
                    onChange={(e) => setNewPromptContent(e.target.value)}
                    placeholder={t('Write or paste your prompt here...')}
                    rows={6}
                    className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors resize-none custom-scrollbar"
                  />
                </div>
              </div>
              <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setShowAddPromptModal(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={handleAddPrompt}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all"
                >
                  {t('Add Prompt')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category and Prompt Manager Modal */}
      <AnimatePresence>
        {showCategoryAndPromptManager && (
          <CategoryAndPromptManager 
            isOpen={showCategoryAndPromptManager}
            onClose={() => setShowCategoryAndPromptManager(false)}
            customCategories={customCategories}
            setCustomCategories={setCustomCategories}
            promptFolders={promptFolders}
            setPromptFolders={setPromptFolders}
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
            customBlocks={customBlocks}
            setCustomBlocks={setCustomBlocks}
            currentUser={currentUser}
            onSaveCategory={handleSaveCategory}
            onDeleteCategory={handleDeleteCategory}
            onSaveCustomBlock={handleSaveCustomBlock}
            onDeleteCustomBlock={handleDeleteCustomBlock}
            onSaveFolder={handleSaveFolder}
            onDeleteFolder={handleDeleteFolder}
            onSavePrompt={handleSavePrompt}
            onDeletePrompt={handleDeletePrompt}
            baseCategories={workMode === 'influencer' ? INFLUENCER_CATEGORIES : GENERAL_CATEGORIES}
            baseBlocks={workMode === 'influencer' ? INFLUENCER_BLOCKS : GENERAL_BLOCKS}
            selectedBlocks={selectedBlocks}
            toggleBlock={toggleBlock}
            setConfirmModal={setConfirmModal}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[400] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  confirmModal.type === 'danger' ? 'bg-red-500/10 text-red-500' :
                  confirmModal.type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  <Icons.AlertTriangle size={32} />
                </div>
                <h2 className="text-lg font-bold text-white mb-2">{confirmModal.title}</h2>
                <p className="text-sm text-zinc-400">{confirmModal.message}</p>
              </div>
              <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center gap-3">
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={confirmModal.onConfirm}
                  className={`flex-1 py-3 text-black text-xs font-bold rounded-xl transition-all ${
                    confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-400' :
                    confirmModal.type === 'warning' ? 'bg-amber-500 hover:bg-amber-400' :
                    'bg-emerald-500 hover:bg-emerald-400'
                  }`}
                >
                  {t('Confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Instruction Modal */}
      <AnimatePresence>
        {showEditInstructionModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[500] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#141414] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{t('Edit Chat Topic')}</h2>
                  <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mt-1">{t('Modify your custom instruction')}</p>
                </div>
                <button 
                  onClick={() => setShowEditInstructionModal(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                >
                  <Icons.X size={20} />
                </button>
              </div>
              <div className="p-6">
                <textarea 
                  value={editingInstructionText}
                  onChange={(e) => setEditingInstructionText(e.target.value)}
                  placeholder={t('Write your instruction here...')}
                  rows={6}
                  className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors resize-none custom-scrollbar"
                />
              </div>
              <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setShowEditInstructionModal(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button 
                  onClick={handleSaveEditedInstruction}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all"
                >
                  {t('Save Changes')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Copy Toast */}
      <AnimatePresence>
        {copyToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-4 py-2 rounded-full font-medium text-sm shadow-lg shadow-emerald-500/20 z-[200] flex items-center gap-2"
          >
            <Icons.Check size={16} />
            {copyToast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


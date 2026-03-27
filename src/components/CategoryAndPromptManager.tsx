import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { Category, Block, CustomCategory, PromptFolder, SavedPrompt, User, CustomBlock } from '../types';

interface CategoryAndPromptManagerProps {
  isOpen: boolean;
  onClose: () => void;
  customCategories: CustomCategory[];
  setCustomCategories: React.Dispatch<React.SetStateAction<CustomCategory[]>>;
  promptFolders: PromptFolder[];
  setPromptFolders: React.Dispatch<React.SetStateAction<PromptFolder[]>>;
  savedPrompts: SavedPrompt[];
  setSavedPrompts: React.Dispatch<React.SetStateAction<SavedPrompt[]>>;
  customBlocks: CustomBlock[];
  setCustomBlocks: React.Dispatch<React.SetStateAction<CustomBlock[]>>;
  currentUser: User | null;
  onSaveCategory: (cat: CustomCategory) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onSaveCustomBlock: (block: CustomBlock) => Promise<void>;
  onDeleteCustomBlock: (id: string) => Promise<void>;
  onSaveFolder: (folder: PromptFolder) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onSavePrompt: (prompt: SavedPrompt) => Promise<void>;
  onDeletePrompt: (id: string) => Promise<void>;
  baseCategories: Category[];
  baseBlocks: Block[];
  selectedBlocks: Block[];
  toggleBlock: (block: Block) => void;
  setConfirmModal: React.Dispatch<React.SetStateAction<any>>;
  t: (key: string) => string;
}

const COMMON_ICONS = [
  'Folder', 'FileText', 'Image', 'Camera', 'Smile', 'User', 'Heart', 'Star', 
  'Zap', 'Sun', 'Moon', 'Cloud', 'MapPin', 'Activity', 'Wind', 'Shirt', 
  'Sparkles', 'Palette', 'Box', 'Target', 'Search', 'ShieldAlert', 'Layers'
];

export const CategoryAndPromptManager: React.FC<CategoryAndPromptManagerProps> = ({
  isOpen,
  onClose,
  customCategories,
  setCustomCategories,
  promptFolders,
  setPromptFolders,
  savedPrompts,
  setSavedPrompts,
  customBlocks,
  setCustomBlocks,
  currentUser,
  onSaveCategory,
  onDeleteCategory,
  onSaveCustomBlock,
  onDeleteCustomBlock,
  onSaveFolder,
  onDeleteFolder,
  onSavePrompt,
  onDeletePrompt,
  baseCategories,
  baseBlocks,
  selectedBlocks,
  toggleBlock,
  setConfirmModal,
  t
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'prompts'>('prompts');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedBaseCategories, setExpandedBaseCategories] = useState<string[]>([]);
  
  // Modals state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<SavedPrompt | null>(null);
  const [editingBlock, setEditingBlock] = useState<CustomBlock | null>(null);

  // Form states
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catIcon, setCatIcon] = useState('Folder');
  const [catParentId, setCatParentId] = useState<string | null>(null);

  const [promptTitle, setPromptTitle] = useState('');
  const [promptContent, setPromptContent] = useState('');
  const [promptFolderId, setPromptFolderId] = useState<string | null>(null);

  const [blockLabel, setBlockLabel] = useState('');
  const [blockPromptText, setBlockPromptText] = useState('');
  const [blockIsNsfw, setBlockIsNsfw] = useState(false);
  const [blockCategoryId, setBlockCategoryId] = useState<string | null>(null);

  const toggleBaseCategory = (id: string) => {
    setExpandedBaseCategories(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredBaseCategories = useMemo(() => {
    if (!searchQuery) return baseCategories;
    return baseCategories.filter(c => 
      c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      baseBlocks.some(b => b.categoryId === c.id && b.label.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [baseCategories, baseBlocks, searchQuery]);

  const filteredCustomCategories = useMemo(() => {
    return customCategories.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [customCategories, searchQuery]);

  const filteredFolders = useMemo(() => {
    return promptFolders.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [promptFolders, searchQuery]);

  const filteredPrompts = useMemo(() => {
    return savedPrompts.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.prompt.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFolder = selectedFolderId ? p.folderId === selectedFolderId : true;
      return matchesSearch && matchesFolder;
    });
  }, [savedPrompts, searchQuery, selectedFolderId]);

  const handleOpenCategoryModal = (cat?: CustomCategory, defaultParentId?: string | null) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatDescription(''); 
      setCatIcon(cat.icon || 'Folder');
      setCatParentId(cat.parentId || null);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatDescription('');
      setCatIcon('Folder');
      setCatParentId(defaultParentId || null);
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategoryForm = async () => {
    if (!catName.trim()) return;
    const cat: CustomCategory = {
      id: editingCategory?.id || `custom_cat_${Date.now()}`,
      name: catName,
      icon: catIcon,
      parentId: catParentId,
      authorId: currentUser?.uid || 'local'
    };
    await onSaveCategory(cat);
    setShowCategoryModal(false);
  };

  const handleOpenPromptModal = (prompt?: SavedPrompt) => {
    if (prompt) {
      setEditingPrompt(prompt);
      setPromptTitle(prompt.title);
      setPromptContent(prompt.prompt);
      setPromptFolderId(prompt.folderId || null);
    } else {
      setEditingPrompt(null);
      setPromptTitle('');
      setPromptContent('');
      setPromptFolderId(selectedFolderId);
    }
    setShowPromptModal(true);
  };

  const handleOpenBlockModal = (block?: CustomBlock, categoryId?: string) => {
    if (block) {
      setEditingBlock(block);
      setBlockLabel(block.label);
      setBlockPromptText(block.promptText);
      setBlockIsNsfw(block.isNsfw || false);
      setBlockCategoryId(block.categoryId);
    } else {
      setEditingBlock(null);
      setBlockLabel('');
      setBlockPromptText('');
      setBlockIsNsfw(false);
      setBlockCategoryId(categoryId || selectedCategoryId);
    }
    setShowBlockModal(true);
  };

  const handleSaveBlockForm = async () => {
    if (!blockLabel.trim() || !blockPromptText.trim() || !blockCategoryId) return;
    const block: CustomBlock = {
      id: editingBlock?.id || `custom_block_${Date.now()}`,
      categoryId: blockCategoryId,
      label: blockLabel,
      title: blockLabel,
      value: blockPromptText,
      promptText: blockPromptText,
      isCustom: true,
      isNsfw: blockIsNsfw,
      authorId: currentUser?.uid || 'local'
    };
    await onSaveCustomBlock(block);
    setShowBlockModal(false);
  };

  const handleSavePromptForm = async () => {
    if (!promptTitle.trim() || !promptContent.trim()) return;
    const prompt: SavedPrompt = {
      id: editingPrompt?.id || `prompt_${Date.now()}`,
      title: promptTitle,
      prompt: promptContent,
      folderId: promptFolderId || undefined,
      authorId: currentUser?.uid || 'local',
      createdAt: editingPrompt?.createdAt || Date.now()
    };
    await onSavePrompt(prompt);
    setShowPromptModal(false);
  };

  const confirmDelete = (type: 'category' | 'folder' | 'prompt' | 'block', id: string, name: string) => {
    setConfirmModal({
      show: true,
      title: t(type === 'category' ? 'Delete Category' : type === 'folder' ? 'Delete Folder' : type === 'prompt' ? 'Delete Prompt' : 'Delete Item'),
      message: t('Are you sure you want to delete this item? This action cannot be undone.').replace('"{name}"', `"${name}"`),
      type: 'danger',
      onConfirm: async () => {
        if (type === 'category') await onDeleteCategory(id);
        else if (type === 'folder') await onDeleteFolder(id);
        else if (type === 'prompt') await onDeletePrompt(id);
        else if (type === 'block') await onDeleteCustomBlock(id);
        setConfirmModal((prev: any) => ({ ...prev, show: false }));
      }
    });
  };

  if (!isOpen) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#181818]">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold text-white">{t('Content Manager')}</h2>
            <div className="flex bg-zinc-800 rounded-lg p-1">
              <button 
                onClick={() => setActiveTab('prompts')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'prompts' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
              >
                {t('Prompts')}
              </button>
              <button 
                onClick={() => setActiveTab('categories')}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'categories' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
              >
                {t('Categories')}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-colors">
            <Icons.X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 border-r border-white/10 bg-[#0F0F0F] flex flex-col">
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                <input 
                  type="text"
                  placeholder={t('Search...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              {activeTab === 'prompts' ? (
                <div>
                  <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">{t('Prompt Folders')}</span>
                    <button 
                      onClick={() => {
                        const id = `folder_${Date.now()}`;
                        onSaveFolder({ id, name: t('New Folder'), authorId: currentUser?.uid || 'local', createdAt: Date.now() });
                      }}
                      className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      <Icons.Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <button 
                      onClick={() => setSelectedFolderId(null)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${!selectedFolderId ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                    >
                      <Icons.Layers size={16} />
                      <span>{t('All Prompts')}</span>
                    </button>
                    {filteredFolders.map(folder => (
                      <div key={folder.id} className="group relative">
                        <button 
                          onClick={() => setSelectedFolderId(folder.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${selectedFolderId === folder.id ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                        >
                          <Icons.Folder size={16} />
                          <span className="truncate">{folder.name}</span>
                        </button>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete('folder', folder.id, folder.name);
                            }}
                            className="p-1 text-zinc-500 hover:text-red-400"
                          >
                            <Icons.Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-3 px-2">
                      <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">{t('Base Categories')}</span>
                    </div>
                    <div className="space-y-1">
                      {filteredBaseCategories.map(cat => (
                        <div key={cat.id}>
                          <button 
                            onClick={() => toggleBaseCategory(cat.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all text-zinc-400 hover:bg-white/5 hover:text-zinc-200`}
                          >
                            <div className="flex items-center gap-3">
                              {Icons[cat.icon as keyof typeof Icons] ? React.createElement(Icons[cat.icon as keyof typeof Icons] as any, { size: 16 }) : <Icons.Folder size={16} />}
                              <span>{cat.label}</span>
                            </div>
                            <Icons.ChevronRight size={14} className={`transition-transform ${expandedBaseCategories.includes(cat.id) ? 'rotate-90' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {expandedBaseCategories.includes(cat.id) && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden ml-4 mt-1 space-y-1 border-l border-white/5 pl-2"
                              >
                                {baseBlocks.filter(b => b.categoryId === cat.id).map(block => (
                                  <div key={block.id} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-default">
                                    {block.label}
                                  </div>
                                ))}
                                {customCategories.filter(c => c.parentId === cat.id).map(customSub => (
                                  <div key={customSub.id} className="group flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-white/5">
                                    <div className="flex items-center gap-2 text-xs text-emerald-400/70">
                                      <Icons.Plus size={10} />
                                      <span>{customSub.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => handleOpenCategoryModal(customSub)} className="p-1 text-zinc-500 hover:text-white">
                                        <Icons.Edit2 size={10} />
                                      </button>
                                      <button onClick={() => confirmDelete('category', customSub.id, customSub.name)} className="p-1 text-zinc-500 hover:text-red-400">
                                        <Icons.Trash2 size={10} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 px-2">
                      <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-widest">{t('My Categories')}</span>
                      <button 
                        onClick={() => handleOpenCategoryModal()}
                        className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
                      >
                        <Icons.Plus size={14} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {filteredCustomCategories.filter(c => !c.parentId).map(cat => (
                        <div key={cat.id} className="group relative">
                          <button 
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${selectedCategoryId === cat.id ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}`}
                          >
                            {Icons[cat.icon as keyof typeof Icons] ? React.createElement(Icons[cat.icon as keyof typeof Icons] as any, { size: 16 }) : <Icons.Folder size={16} />}
                            <span className="truncate">{cat.name}</span>
                          </button>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleOpenCategoryModal(cat)} className="p-1 text-zinc-500 hover:text-white">
                              <Icons.Edit2 size={12} />
                            </button>
                            <button onClick={() => confirmDelete('category', cat.id, cat.name)} className="p-1 text-zinc-500 hover:text-red-400">
                              <Icons.Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 bg-[#121212] flex flex-col">
            <div className="p-6 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-4">
                {activeTab === 'categories' && selectedCategoryId && (
                  <button 
                    onClick={() => {
                      const currentCat = customCategories.find(c => c.id === selectedCategoryId);
                      setSelectedCategoryId(currentCat?.parentId || null);
                    }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                  >
                    <Icons.ArrowLeft size={20} />
                  </button>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {activeTab === 'prompts' ? t('My Saved Prompts') : 
                     selectedCategoryId ? (
                       baseCategories.find(c => c.id === selectedCategoryId)?.label || 
                       customCategories.find(c => c.id === selectedCategoryId)?.name || 
                       t('Category Details')
                     ) : t('My Custom Categories')}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    {activeTab === 'prompts' 
                      ? t('Showing {n} prompts').replace('{n}', filteredPrompts.length.toString()) 
                      : selectedCategoryId 
                        ? t('Manage items and subcategories')
                        : t('Showing {n} custom categories').replace('{n}', filteredCustomCategories.length.toString())}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {activeTab === 'categories' && selectedCategoryId && (
                  <button 
                    onClick={() => handleOpenBlockModal(undefined, selectedCategoryId)}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-all border border-white/5"
                  >
                    <Icons.Plus size={18} />
                    <span>{t('Add Item')}</span>
                  </button>
                )}
                <button 
                  onClick={() => activeTab === 'prompts' ? handleOpenPromptModal() : handleOpenCategoryModal()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Icons.Plus size={18} />
                  <span>{t('Add {type}').replace('{type}', activeTab === 'prompts' ? t('Prompt') : t('Category'))}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {activeTab === 'prompts' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPrompts.map(prompt => (
                    <motion.div 
                      layout
                      key={prompt.id}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-all group flex flex-col h-full"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                            <Icons.FileText size={20} />
                          </div>
                          <h4 className="font-bold text-white truncate max-w-[150px]">{prompt.title}</h4>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleOpenPromptModal(prompt)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg">
                            <Icons.Edit2 size={14} />
                          </button>
                          <button onClick={() => confirmDelete('prompt', prompt.id, prompt.title)} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg">
                            <Icons.Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 bg-black/30 rounded-xl p-4 border border-white/5 mb-4">
                        <p className="text-sm text-zinc-400 line-clamp-4 leading-relaxed italic">
                          "{prompt.prompt}"
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                          {new Date(prompt.createdAt).toLocaleDateString()}
                        </span>
                        {prompt.folderId && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-md text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                            <Icons.Folder size={10} />
                            {promptFolders.find(f => f.id === prompt.folderId)?.name}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : selectedCategoryId ? (
                <div className="space-y-8">
                  {/* Items (Blocks) Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('Items / Variants')}</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Base Blocks */}
                      {baseBlocks.filter(b => b.categoryId === selectedCategoryId).map(block => {
                        const isSelected = selectedBlocks.some(b => b.id === block.id);
                        return (
                          <div 
                            key={block.id}
                            className={`bg-zinc-900/50 border rounded-2xl p-4 transition-all flex items-center justify-between group ${isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <button 
                                onClick={() => toggleBlock(block)}
                                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-white/20 hover:border-emerald-500/50'}`}
                              >
                                {isSelected && <Icons.Check size={12} strokeWidth={4} />}
                              </button>
                              <div className="overflow-hidden">
                                <h5 className="text-sm font-bold text-white truncate">{block.label}</h5>
                                <p className="text-[10px] text-zinc-500 truncate italic">"{block.promptText || block.value}"</p>
                              </div>
                            </div>
                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{t('Base')}</div>
                          </div>
                        );
                      })}
                      {/* Custom Blocks */}
                      {customBlocks.filter(b => b.categoryId === selectedCategoryId).map(block => {
                        const isSelected = selectedBlocks.some(b => b.id === block.id);
                        return (
                          <div 
                            key={block.id}
                            className={`bg-zinc-900/50 border rounded-2xl p-4 transition-all flex items-center justify-between group ${isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <button 
                                onClick={() => toggleBlock(block)}
                                className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500 text-black' : 'border-white/20 hover:border-emerald-500/50'}`}
                              >
                                {isSelected && <Icons.Check size={12} strokeWidth={4} />}
                              </button>
                              <div className="overflow-hidden">
                                <h5 className="text-sm font-bold text-white truncate">{block.label}</h5>
                                <p className="text-[10px] text-emerald-500/50 truncate italic">"{block.promptText}"</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleOpenBlockModal(block)} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md">
                                <Icons.Edit2 size={12} />
                              </button>
                              <button onClick={() => confirmDelete('block', block.id, block.label)} className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md">
                                <Icons.Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subcategories Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{t('Subcategories / Folders')}</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {customCategories.filter(c => c.parentId === selectedCategoryId).map(cat => (
                        <div 
                          key={cat.id}
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 hover:border-emerald-500/30 transition-all group flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                              {Icons[cat.icon as keyof typeof Icons] ? React.createElement(Icons[cat.icon as keyof typeof Icons] as any, { size: 16 }) : <Icons.Folder size={16} />}
                            </div>
                            <h5 className="text-sm font-bold text-white">{cat.name}</h5>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleOpenCategoryModal(cat); }}
                              className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md"
                            >
                              <Icons.Edit2 size={12} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); confirmDelete('category', cat.id, cat.name); }}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md"
                            >
                              <Icons.Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => handleOpenCategoryModal(undefined, selectedCategoryId)}
                        className="border border-dashed border-white/10 rounded-2xl p-4 flex items-center justify-center gap-2 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                      >
                        <Icons.Plus size={16} />
                        <span className="text-sm font-bold">{t('New Subcategory')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCustomCategories.filter(c => !c.parentId).map(cat => (
                    <motion.div 
                      layout
                      key={cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-all group cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                            {Icons[cat.icon as keyof typeof Icons] ? React.createElement(Icons[cat.icon as keyof typeof Icons] as any, { size: 20 }) : <Icons.Folder size={20} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-white">{cat.name}</h4>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                              {t('Top-level category')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleOpenCategoryModal(cat); }}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg"
                          >
                            <Icons.Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); confirmDelete('category', cat.id, cat.name); }}
                            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
                          >
                            <Icons.Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category Modal */}
        <AnimatePresence>
          {showCategoryModal && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-[#181818] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{editingCategory ? t('Edit Category') : t('Add Category')}</h3>
                  <button onClick={() => setShowCategoryModal(false)} className="text-zinc-400 hover:text-white"><Icons.X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Name')}</label>
                    <input 
                      type="text"
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder={t('e.g. My Style')}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Parent Category (Optional)')}</label>
                    <select 
                      value={catParentId || ''}
                      onChange={(e) => setCatParentId(e.target.value || null)}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">{t('None (Top-level)')}</option>
                      {baseCategories.map(bc => (
                        <option key={bc.id} value={bc.id}>{bc.label}</option>
                      ))}
                      {customCategories.filter(c => c.id !== editingCategory?.id).map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name} ({t('Custom')})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Icon')}</label>
                    <div className="grid grid-cols-6 gap-2">
                      {COMMON_ICONS.map(iconName => (
                        <button 
                          key={iconName}
                          onClick={() => setCatIcon(iconName)}
                          className={`p-2 rounded-lg flex items-center justify-center transition-all ${catIcon === iconName ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 hover:bg-white/5'}`}
                        >
                          {Icons[iconName as keyof typeof Icons] ? React.createElement(Icons[iconName as keyof typeof Icons] as any, { size: 18 }) : <Icons.HelpCircle size={18} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center justify-end gap-3">
                  <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white">{t('Cancel')}</button>
                  <button onClick={handleSaveCategoryForm} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all">{t('Save Category')}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Block Modal */}
        <AnimatePresence>
          {showBlockModal && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-[#181818] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{editingBlock ? t('Edit Item') : t('Add Item')}</h3>
                  <button onClick={() => setShowBlockModal(false)} className="text-zinc-400 hover:text-white"><Icons.X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Label')}</label>
                    <input 
                      type="text"
                      value={blockLabel}
                      onChange={(e) => setBlockLabel(e.target.value)}
                      placeholder={t('e.g. Cinematic Lighting')}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Prompt Text')}</label>
                    <textarea 
                      value={blockPromptText}
                      onChange={(e) => setBlockPromptText(e.target.value)}
                      placeholder={t('The text that will be added to the prompt...')}
                      rows={3}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                        <Icons.ShieldAlert size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{t('NSFW Content')}</p>
                        <p className="text-[10px] text-zinc-500">{t('Mark if this item contains adult content')}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setBlockIsNsfw(!blockIsNsfw)}
                      className={`w-10 h-5 rounded-full transition-all relative ${blockIsNsfw ? 'bg-amber-500' : 'bg-zinc-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${blockIsNsfw ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
                <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center justify-end gap-3">
                  <button onClick={() => setShowBlockModal(false)} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white">{t('Cancel')}</button>
                  <button onClick={handleSaveBlockForm} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all">{t('Save Item')}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt Modal */}
        <AnimatePresence>
          {showPromptModal && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-[#181818] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">{editingPrompt ? t('Edit Prompt') : t('Add Prompt')}</h3>
                  <button onClick={() => setShowPromptModal(false)} className="text-zinc-400 hover:text-white"><Icons.X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Title')}</label>
                    <input 
                      type="text"
                      value={promptTitle}
                      onChange={(e) => setPromptTitle(e.target.value)}
                      placeholder={t('e.g. Hyper-realistic Portrait')}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Content')}</label>
                    <textarea 
                      value={promptContent}
                      onChange={(e) => setPromptContent(e.target.value)}
                      placeholder={t('Write your prompt here...')}
                      rows={5}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 resize-none custom-scrollbar"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('Folder')}</label>
                    <select 
                      value={promptFolderId || ''}
                      onChange={(e) => setPromptFolderId(e.target.value || null)}
                      className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="">{t('No Folder')}</option>
                      {promptFolders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="p-6 bg-zinc-900/50 border-t border-white/5 flex items-center justify-end gap-3">
                  <button onClick={() => setShowPromptModal(false)} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white">{t('Cancel')}</button>
                  <button onClick={handleSavePromptForm} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all">{t('Save Prompt')}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

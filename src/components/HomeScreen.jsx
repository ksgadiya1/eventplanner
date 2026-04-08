import React, { useState } from 'react';
import { Calendar, Plus, ChevronRight, ChevronDown, MapPin, Tag, Pencil, Copy, Archive, ArchiveRestore, Trash2, FolderArchive, Check, X } from 'lucide-react';

const EVENT_TYPES = [
    { id: 'festival', label: 'Festival', icon: '🎪' },
    { id: 'concert', label: 'Concert', icon: '🎸' },
    { id: 'wedding', label: 'Wedding / Function', icon: '💍' },
    { id: 'corporate', label: 'Corporate Event', icon: '🏢' },
    { id: 'sports', label: 'Sports Event', icon: '⚽' },
    { id: 'other', label: 'Other', icon: '📍' },
];

const HomeScreen = ({ onCreateEvent, onResumeEvent, onRenameEvent, onDeleteEvent, onDuplicateEvent, onArchiveEvent, onUnarchiveEvent, eventList = [] }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('festival');
    const [editingEventId, setEditingEventId] = useState(null);
    const [renameDraft, setRenameDraft] = useState('');

    const handleCreate = () => {
        if (!newName.trim()) {
            alert('Please enter an event name');
            return;
        }
        onCreateEvent(newName, newType);
    };

    const startRename = (event) => {
        setEditingEventId(event.id);
        setRenameDraft(event.name || '');
    };

    const cancelRename = () => {
        setEditingEventId(null);
        setRenameDraft('');
    };

    const commitRename = () => {
        const nextName = renameDraft.trim();
        if (editingEventId && nextName) {
            onRenameEvent?.(editingEventId, nextName);
        }
        cancelRename();
    };

    const activeEvents = eventList.filter(event => !event.isArchived);
    const archivedEvents = eventList.filter(event => event.isArchived);

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: 'white',
            fontFamily: "'Inter', sans-serif",
            padding: '1rem',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '860px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
            }}>
                <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '800',
                        marginBottom: '0',
                        background: 'linear-gradient(to right, #6366f1, #a855f7)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.025em',
                    }}>
                        EventWiz
                    </h1>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                        Event Site Planning & Layout
                    </p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 280px',
                    gap: '1rem',
                    alignItems: 'start',
                }}>
                    {/* Left Side: Recent Projects */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '1rem',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '300px',
                    }}>
                        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '0.950rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Calendar size={16} color="#6366f1" /> Recent Events
                            </h2>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                {activeEvents.length} active
                            </span>
                        </div>

                        <div style={{ padding: '0.5rem', overflowY: 'auto', maxHeight: '520px' }} className="custom-scrollbar">
                            {activeEvents.length === 0 ? (
                                <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: '0.5rem' }}>
                                    <MapPin size={32} strokeWidth={1} />
                                    <p style={{ fontSize: '0.8rem' }}>No active events found.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {activeEvents.map(event => {
                                        const eventTypeId = event.event_type || event.eventType;
                                        return (
                                            <div
                                                key={event.id}
                                                onClick={() => {
                                                    if (editingEventId === event.id) return;
                                                    onResumeEvent(event.id);
                                                }}
                                                style={{
                                                    padding: '0.6rem 0.8rem',
                                                    borderRadius: '0.6rem',
                                                    background: 'rgba(255, 255, 255, 0.04)',
                                                    border: '1px solid transparent',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                                                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                                                    e.currentTarget.style.borderColor = 'transparent';
                                                }}
                                            >
                                                <div style={{ fontSize: '0.9rem' }}>{EVENT_TYPES.find(t => t.id === eventTypeId)?.icon || '📍'}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {editingEventId === event.id ? (
                                                        <>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    value={renameDraft}
                                                                    onChange={(e) => setRenameDraft(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') commitRename();
                                                                        if (e.key === 'Escape') cancelRename();
                                                                    }}
                                                                    style={{
                                                                        flex: 1,
                                                                        minWidth: 0,
                                                                        padding: '0.3rem 0.45rem',
                                                                        borderRadius: '0.45rem',
                                                                        border: '1px solid rgba(99,102,241,0.45)',
                                                                        background: 'rgba(15,23,42,0.65)',
                                                                        color: 'white',
                                                                        fontSize: '0.8rem',
                                                                        outline: 'none',
                                                                    }}
                                                                />
                                                                <button title="Save rename" onClick={commitRename} style={{ background: 'transparent', border: 'none', color: '#86efac', cursor: 'pointer', padding: '0.2rem' }}>
                                                                    <Check size={14} />
                                                                </button>
                                                                <button title="Cancel rename" onClick={cancelRename} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.2rem' }}>
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                                {new Date(event.created_at).toLocaleDateString()}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{ fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                {new Date(event.created_at).toLocaleDateString()}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }} onClick={(e) => e.stopPropagation()}>
                                                    <button title="Rename" onClick={() => startRename(event)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.25rem' }}>
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button title="Duplicate" onClick={() => onDuplicateEvent?.(event.id)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.25rem' }}>
                                                        <Copy size={13} />
                                                    </button>
                                                    <button title="Archive" onClick={() => onArchiveEvent?.(event.id)} style={{ background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer', padding: '0.25rem' }}>
                                                        <Archive size={13} />
                                                    </button>
                                                    <button
                                                        title="Delete"
                                                        onClick={() => {
                                                            if (window.confirm('Are you sure you want to delete this event? This cannot be undone.')) {
                                                                onDeleteEvent?.(event.id);
                                                            }
                                                        }}
                                                        style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: '0.25rem' }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                                <ChevronRight size={14} color="#64748b" />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {archivedEvents.length > 0 && (
                                <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
                                    <button
                                        onClick={() => setShowArchived(prev => !prev)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            background: 'rgba(255,255,255,0.03)',
                                            color: '#cbd5e1',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '0.6rem',
                                            padding: '0.6rem 0.75rem',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                            <FolderArchive size={14} /> Archived Events ({archivedEvents.length})
                                        </span>
                                        {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>

                                    {showArchived && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                            {archivedEvents.map(event => {
                                                const eventTypeId = event.event_type || event.eventType;
                                                return (
                                                    <div
                                                        key={event.id}
                                                        onClick={() => onResumeEvent(event.id)}
                                                        style={{
                                                            padding: '0.6rem 0.8rem',
                                                            borderRadius: '0.6rem',
                                                            background: 'rgba(148, 163, 184, 0.08)',
                                                            border: '1px solid rgba(148, 163, 184, 0.14)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.75rem',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{EVENT_TYPES.find(t => t.id === eventTypeId)?.icon || '📍'}</div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
                                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Archived event</div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <button
                                                                title="Unarchive"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onUnarchiveEvent?.(event.id);
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.3rem',
                                                                    background: 'rgba(16, 185, 129, 0.12)',
                                                                    color: '#86efac',
                                                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                    borderRadius: '0.5rem',
                                                                    padding: '0.38rem 0.5rem',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: '700',
                                                                }}
                                                            >
                                                                <ArchiveRestore size={12} /> Unarchive
                                                            </button>
                                                            <button
                                                                title="Delete"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm('Are you sure you want to delete this archived event? This cannot be undone.')) {
                                                                        onDeleteEvent?.(event.id);
                                                                    }
                                                                }}
                                                                style={{
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    color: '#fca5a5',
                                                                    cursor: 'pointer',
                                                                    padding: '0.25rem'
                                                                }}
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Side: Action Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {!isCreating ? (
                            <div style={{
                                padding: '1rem',
                                borderRadius: '1rem',
                                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                            }}>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Get Started</h3>
                                <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '0.8rem', lineHeight: '1.3' }}>
                                    Launch a new project with professional tools.
                                </p>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    style={{
                                        background: 'white',
                                        color: '#6366f1',
                                        border: 'none',
                                        padding: '0.65rem',
                                        borderRadius: '0.6rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.4rem',
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    <Plus size={16} /> Create New
                                </button>
                            </div>
                        ) : (
                            <div style={{
                                padding: '1rem',
                                borderRadius: '1rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                maxHeight: '85vh',
                                overflowY: 'auto'
                            }} className="custom-scrollbar">
                                <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>New Project</h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Event Name</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="Name..."
                                        style={{
                                            width: '100%',
                                            padding: '0.6rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            color: 'white',
                                            outline: 'none',
                                            fontSize: '0.8rem',
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <label style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Event Type</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                                        {EVENT_TYPES.map(type => (
                                            <div
                                                key={type.id}
                                                onClick={() => setNewType(type.id)}
                                                style={{
                                                    padding: '0.4rem',
                                                    borderRadius: '0.5rem',
                                                    background: newType === type.id ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                                                    border: `1px solid ${newType === type.id ? '#6366f1' : 'transparent'}`,
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <div style={{ fontSize: '0.9rem' }}>{type.icon}</div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: '600' }}>{type.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem',
                                            borderRadius: '0.5rem',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            background: 'transparent',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem',
                                            borderRadius: '0.5rem',
                                            border: 'none',
                                            background: 'linear-gradient(to right, #6366f1, #a855f7)',
                                            color: 'white',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                        }}
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{
                            padding: '0.85rem',
                            borderRadius: '1rem',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                        }}>
                            <Tag size={14} />
                            <div>
                                <div style={{ color: 'white', fontWeight: '600', fontSize: '0.75rem' }}>Templates</div>
                                <div style={{ fontSize: '0.7rem' }}>Premium sites coming soon.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); borderRadius: 10px; }
            `}</style>
        </div>
    );
};

export default HomeScreen;

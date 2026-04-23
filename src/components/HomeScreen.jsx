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

const panel = {
    background: 'rgba(255,255,255,0.82)',
    border: '1px solid rgba(226,232,240,0.9)',
    borderRadius: 24,
    boxShadow: '0 8px 40px rgba(15,23,42,0.07)',
    backdropFilter: 'blur(16px)',
};

const inputStyle = {
    width: '100%',
    height: 44,
    border: '1.5px solid #e2e8f0',
    borderRadius: 10,
    padding: '0 14px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#0f172a',
    fontFamily: 'inherit',
};

const HomeScreen = ({ onCreateEvent, onResumeEvent, onRenameEvent, onDeleteEvent, onDuplicateEvent, onArchiveEvent, onUnarchiveEvent, eventList = [] }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [newLocation, setNewLocation] = useState('');
    const [newType, setNewType] = useState('festival');
    const [editingEventId, setEditingEventId] = useState(null);
    const [renameDraft, setRenameDraft] = useState('');

    const handleCreate = () => {
        if (!newName.trim()) { alert('Please enter an event name'); return; }
        onCreateEvent(newName, newType, newDate, newLocation);
    };

    const startRename = (event) => { setEditingEventId(event.id); setRenameDraft(event.name || ''); };
    const cancelRename = () => { setEditingEventId(null); setRenameDraft(''); };
    const commitRename = () => {
        const nextName = renameDraft.trim();
        if (editingEventId && nextName) onRenameEvent?.(editingEventId, nextName);
        cancelRename();
    };

    const activeEvents = eventList.filter(e => !e.isArchived);
    const archivedEvents = eventList.filter(e => e.isArchived);

    return (
        <div style={{
            height: '100vh',
            overflowY: 'auto',
            background: 'linear-gradient(135deg, #eef0fb 0%, #e8f5f0 50%, #f0f4ff 100%)',
            color: '#0f172a',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 80px' }}>

                {/* ── Hero row ── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1.4fr) 360px',
                    gap: 24,
                    alignItems: 'stretch',
                    marginBottom: 40,
                }}>

                    {/* Left panel */}
                    <div style={{ ...panel, padding: '32px 32px 28px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', bottom: -80, right: -80,
                            width: 240, height: 240, borderRadius: '50%',
                            background: 'radial-gradient(circle,rgba(124,58,237,0.12) 0%,transparent 70%)',
                            pointerEvents: 'none',
                        }} />

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 700, marginBottom: 18 }}>
                            <MapPin size={14} />
                            EventWiz Home
                        </div>

                        <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(30px,3.6vw,52px)', lineHeight: 1.05, letterSpacing: '-0.04em', color: '#0f172a', fontWeight: 900 }}>
                            Plan events that stay<br />saved, organized, and<br />easy to reopen.
                        </h1>

                        <p style={{ margin: '0 0 24px', fontSize: 15, color: '#475569', lineHeight: 1.7, maxWidth: 560 }}>
                            Create a new event, reopen a project you already started, and let EventWiz save the full planner state locally as you work.
                        </p>

                        {/* Stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                            {[
                                { label: 'Projects', value: eventList.length, bg: 'rgba(79,70,229,0.07)', border: 'rgba(99,102,241,0.18)', color: '#6366f1' },
                                { label: 'Active', value: activeEvents.length, bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.18)', color: '#059669' },
                                { label: 'Archived', value: archivedEvents.length, bg: 'rgba(249,115,22,0.07)', border: 'rgba(249,115,22,0.18)', color: '#ea580c' },
                            ].map(s => (
                                <div key={s.label} style={{ padding: '14px 16px', borderRadius: 14, background: s.bg, border: `1px solid ${s.border}` }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</div>
                                    <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, color: '#0f172a' }}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {['Auto-save enabled', 'Resume from home', 'Multiple event types'].map(b => (
                                <span key={b} style={{ padding: '7px 13px', borderRadius: 999, background: '#fff', border: '1px solid #e2e8f0', color: '#475569', fontSize: 12, fontWeight: 600 }}>
                                    {b}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Right panel */}
                    <div style={{ ...panel, padding: 24, display: 'flex', flexDirection: 'column' }}>
                        {!isCreating ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Get Started</div>
                                        <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Launch a new project with professional tools.</div>
                                    </div>
                                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', display: 'grid', placeItems: 'center', color: '#6d28d9', flexShrink: 0 }}>
                                        <Calendar size={18} />
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    style={{
                                        width: '100%', height: 48, border: 'none', borderRadius: 12,
                                        background: 'linear-gradient(135deg,#7c3aed,#5b21b6)',
                                        color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        boxShadow: '0 8px 24px rgba(124,58,237,0.28)',
                                        marginBottom: 12,
                                    }}
                                >
                                    <Plus size={18} /> Create New
                                </button>

                                {/* Templates placeholder */}
                                <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(248,250,252,0.9)', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Tag size={16} color="#94a3b8" />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Templates</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Premium sites coming soon.</div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>New Project</div>

                                <div style={{ display: 'grid', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>Event Name</label>
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={e => setNewName(e.target.value)}
                                            placeholder="Name..."
                                            style={inputStyle}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>Event Date</label>
                                        <input
                                            type="date"
                                            value={newDate}
                                            onChange={e => setNewDate(e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 6 }}>Event Location</label>
                                        <input
                                            type="text"
                                            value={newLocation}
                                            onChange={e => setNewLocation(e.target.value)}
                                            placeholder="Enter city, area, or address..."
                                            style={inputStyle}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'block', marginBottom: 8 }}>Event Type</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                            {EVENT_TYPES.map(type => (
                                                <div
                                                    key={type.id}
                                                    onClick={() => setNewType(type.id)}
                                                    style={{
                                                        padding: '10px 8px',
                                                        borderRadius: 10,
                                                        background: newType === type.id ? 'rgba(99,102,241,0.1)' : '#f8fafc',
                                                        border: `1.5px solid ${newType === type.id ? '#6366f1' : '#e2e8f0'}`,
                                                        cursor: 'pointer',
                                                        textAlign: 'center',
                                                        transition: 'all 0.15s',
                                                    }}
                                                >
                                                    <div style={{ fontSize: '1rem' }}>{type.icon}</div>
                                                    <div style={{ fontSize: 11, fontWeight: 600, color: newType === type.id ? '#4338ca' : '#475569', marginTop: 3 }}>{type.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button
                                            onClick={() => setIsCreating(false)}
                                            style={{ flex: 1, height: 42, borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreate}
                                            style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Your Events ── */}
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Your Events</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
                            {activeEvents.length ? `${activeEvents.length} active event${activeEvents.length === 1 ? '' : 's'}` : 'No active events yet'}
                        </div>
                    </div>

                    {activeEvents.length === 0 ? (
                        <div style={{ ...panel, padding: '48px 24px', textAlign: 'center', display: 'grid', placeItems: 'center' }}>
                            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)', display: 'grid', placeItems: 'center', color: '#4f46e5', margin: '0 auto 14px' }}>
                                <MapPin size={26} />
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Nothing saved yet</div>
                            <div style={{ fontSize: 13, color: '#64748b', maxWidth: 340, lineHeight: 1.7 }}>
                                Create your first project and it will show up here automatically for quick resuming.
                            </div>
                        </div>
                    ) : (
                        <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                {activeEvents.map(event => {
                                    const eventTypeId = event.event_type || event.eventType;
                                    return (
                                        <div
                                            key={event.id}
                                            onClick={() => { if (editingEventId === event.id) return; onResumeEvent(event.id); }}
                                            style={{
                                                padding: '16px 18px',
                                                borderRadius: 18,
                                                background: 'rgba(255,255,255,0.9)',
                                                border: '1px solid #e8edf5',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 14,
                                                boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.22)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.12)'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.9)'; e.currentTarget.style.borderColor = '#e8edf5'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(15,23,42,0.05)'; }}
                                        >
                                            <div style={{ fontSize: '1.1rem', flexShrink: 0 }}>{EVENT_TYPES.find(t => t.id === eventTypeId)?.icon || '📍'}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                {editingEventId === event.id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={renameDraft}
                                                            onChange={e => setRenameDraft(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                                                            style={{ ...inputStyle, height: 34, fontSize: 13 }}
                                                        />
                                                        <button onClick={commitRename} style={{ background: 'transparent', border: 'none', color: '#059669', cursor: 'pointer', padding: 4 }}><Check size={14} /></button>
                                                        <button onClick={cancelRename} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
                                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{new Date(event.created_at).toLocaleDateString()}</div>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                                                <button title="Rename" onClick={() => startRename(event)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 5, borderRadius: 8, display: 'grid', placeItems: 'center' }}><Pencil size={13} /></button>
                                                <button title="Duplicate" onClick={() => onDuplicateEvent?.(event.id)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 5, borderRadius: 8, display: 'grid', placeItems: 'center' }}><Copy size={13} /></button>
                                                <button title="Archive" onClick={() => onArchiveEvent?.(event.id)} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 5, borderRadius: 8, display: 'grid', placeItems: 'center' }}><Archive size={13} /></button>
                                                <button title="Delete" onClick={() => { if (window.confirm('Delete this event? This cannot be undone.')) onDeleteEvent?.(event.id); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 5, borderRadius: 8, display: 'grid', placeItems: 'center' }}><Trash2 size={13} /></button>
                                            </div>
                                            <ChevronRight size={14} color="#cbd5e1" />
                                        </div>
                                    );
                                })}
                        </div>

                        {/* Archived section */}
                        {archivedEvents.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <button
                                    onClick={() => setShowArchived(p => !p)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'rgba(255,255,255,0.9)', color: '#475569', border: '1px solid #e8edf5',
                                        borderRadius: 14, padding: '12px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                        boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <FolderArchive size={15} color="#f59e0b" /> Archived Events ({archivedEvents.length})
                                    </span>
                                    {showArchived ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>

                                {showArchived && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12, marginBottom: 8 }}>
                                        {archivedEvents.map(event => {
                                            const eventTypeId = event.event_type || event.eventType;
                                            return (
                                                <div
                                                    key={event.id}
                                                    onClick={() => onResumeEvent(event.id)}
                                                    style={{
                                                        padding: '16px 18px', borderRadius: 18,
                                                        background: 'rgba(255,255,255,0.7)', border: '1px solid #e8edf5',
                                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                                                        boxShadow: '0 2px 12px rgba(15,23,42,0.04)',
                                                        opacity: 0.85, transition: 'all 0.15s',
                                                    }}
                                                    onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)'; }}
                                                    onMouseOut={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.borderColor = '#e8edf5'; }}
                                                >
                                                    <div style={{ fontSize: '1.1rem', opacity: 0.7, flexShrink: 0 }}>{EVENT_TYPES.find(t => t.id === eventTypeId)?.icon || '📍'}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
                                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Archived event</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            title="Unarchive"
                                                            onClick={e => { e.stopPropagation(); onUnarchiveEvent?.(event.id); }}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                                                        >
                                                            <ArchiveRestore size={12} /> Unarchive
                                                        </button>
                                                        <button
                                                            title="Delete"
                                                            onClick={e => { e.stopPropagation(); if (window.confirm('Delete this archived event? This cannot be undone.')) onDeleteEvent?.(event.id); }}
                                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 5, display: 'grid', placeItems: 'center', flexShrink: 0 }}
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HomeScreen;

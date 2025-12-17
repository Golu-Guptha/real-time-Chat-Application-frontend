import { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { AppDataContext } from '../context/AppDataContext';

const SearchPanel = ({ onClose, onJoinChannel, onChannelSelect }) => {
    const { user } = useContext(AuthContext);
    const { sendFriendRequest, myChannels } = useContext(AppDataContext); // Assuming sendFriendRequest is exposed or we call API directly 
    // Wait, sendFriendRequest is in context? I returned `refreshData` only.
    // I should call API directly here or use a helper.

    const [activeTab, setActiveTab] = useState('channels'); // 'channels' or 'users'
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const endpoint = activeTab === 'channels'
                ? `${import.meta.env.VITE_API_URL}/api/channels/search?query=${query}`
                : `${import.meta.env.VITE_API_URL}/api/users/search?query=${query}`;

            const res = await axios.get(endpoint, {
                headers: { 'x-auth-token': token }
            });
            setResults(res.data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    };

    const handleJoin = (channel) => {
        onJoinChannel(channel);
    };

    const handleSendRequest = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/users/friend-request`, { userId }, {
                headers: { 'x-auth-token': token }
            });
            alert('Friend request sent!');
            // Update UI/Context?
        } catch (err) {
            alert(err.response?.data?.msg || 'Failed to send request');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal search-modal" style={{ maxWidth: '600px', width: '90%' }}>
                <div className="modal-header">
                    <h3>Search</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <div className="tabs" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <button
                        style={{ flex: 1, padding: '10px', background: activeTab === 'channels' ? '#646cff' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer', color: 'white' }}
                        onClick={() => { setActiveTab('channels'); setResults([]); setQuery(''); }}
                    >
                        Channels
                    </button>
                    <button
                        style={{ flex: 1, padding: '10px', background: activeTab === 'users' ? '#646cff' : '#333', border: 'none', borderRadius: '5px', cursor: 'pointer', color: 'white' }}
                        onClick={() => { setActiveTab('users'); setResults([]); setQuery(''); }}
                    >
                        Users
                    </button>
                </div>

                <form onSubmit={handleSearch} className="search-form" style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        placeholder={`Search ${activeTab}...`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="search-input"
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: '1px solid #333',
                            background: '#1f1f1f',
                            color: 'white',
                            fontSize: '1rem',
                            minWidth: 0 // Prevents flex item from overflowing
                        }}
                    />
                    <button type="submit" className="btn-primary" style={{
                        width: 'auto', // OVERRIDE GLOBAL CSS (was 100%)
                        flexShrink: 0,
                        padding: '12px 24px',
                        fontSize: '0.95rem',
                        whiteSpace: 'nowrap',
                        alignSelf: 'stretch',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>Search</button>
                </form>

                <div className="results-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {loading && <p style={{ textAlign: 'center', color: '#888' }}>Loading...</p>}
                    {results.map(item => (
                        <div key={item._id} className="result-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#2a2a2a', marginBottom: '10px', borderRadius: '8px' }}>
                            {activeTab === 'channels' ? (
                                <>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}># {item.name} {item.isPrivate && '🔒'}</div>
                                        <div style={{ color: '#888', fontSize: '0.9rem' }}>{item.description || 'No description'} • {item.members?.length || 0} members</div>
                                    </div>
                                    <button
                                        onClick={() => handleJoin(item)}
                                        style={{ padding: '8px 16px', background: myChannels.some(c => c._id === item._id) ? '#333' : '#646cff', border: 'none', borderRadius: '5px', color: 'white', cursor: 'pointer' }}
                                        disabled={myChannels.some(c => c._id === item._id)}
                                    >
                                        {myChannels.some(c => c._id === item._id) ? 'Joined' : 'Join'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                                        onClick={async () => {
                                            // Handle DM Click
                                            try {
                                                const token = localStorage.getItem('token');
                                                const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/dm`, { recipientId: item._id }, {
                                                    headers: { 'x-auth-token': token }
                                                });
                                                if (onChannelSelect) {
                                                    onChannelSelect(res.data);
                                                } else {
                                                    handleJoin(res.data); // Fallback but might fail for DMs if handleJoin only does join logic
                                                }
                                                onClose();
                                            } catch (err) {
                                                console.error(err);
                                                alert('Failed to open chat');
                                            }
                                        }}
                                    >
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#646cff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                            {item.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{item.username}</div>
                                            <div style={{ color: '#888', fontSize: '0.8rem' }}>{item.email}</div>
                                        </div>
                                    </div>
                                    {/* Helper to check if already friends could use 'friends' from context, but simpler to just show Add button or rely on backend to reject duplicate */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleSendRequest(item._id); }}
                                        style={{ padding: '8px 16px', background: '#333', border: '1px solid #555', borderRadius: '5px', color: 'white', cursor: 'pointer' }}
                                        title="Send Friend Request"
                                    >
                                        +
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                    {!loading && results.length === 0 && query && <p style={{ textAlign: 'center', color: '#888' }}>No results found</p>}
                </div>
            </div>
        </div>
    );
};

export default SearchPanel;

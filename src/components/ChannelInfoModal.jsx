import { useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { AppDataContext } from '../context/AppDataContext';
import { toast } from 'react-toastify';

const ChannelInfoModal = ({ channel, onClose, onChannelSelect, onlineUsers }) => {
    const { user } = useContext(AuthContext);
    const { refreshData } = useContext(AppDataContext);

    const handleSendRequest = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/users/friend-request`, { userId }, {
                headers: { 'x-auth-token': token }
            });
            toast.success('Friend request sent');
        } catch (err) {
            toast.error(err.response?.data?.msg || 'Failed');
        }
    };

    const handleRemoveUser = async (userId) => {
        if (!window.confirm('Remove user?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/remove-user`, {
                channelId: channel._id,
                userId: userId
            }, {
                headers: { 'x-auth-token': token }
            });
            refreshData(); // Triggers update in parent potentially
            // For now, we rely on parent refresh or we could locally update if passed a setter, 
            // but this modal uses the 'channel' prop which might be stale unless parent updates.
            // Ideally Chat.jsx listens to 'user_removed' or we force refresh.
            toast.success('User removed');
        } catch (err) {
            toast.error('Failed to remove user');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h3>Channel Info</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="channel-details" style={{ padding: '20px', borderBottom: '1px solid #444' }}>
                    <h2># {channel.name} {channel.isPrivate && '🔒'}</h2>
                    <p style={{ color: '#aaa', fontStyle: 'italic' }}>{channel.description || 'No description'}</p>
                    <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#888' }}>
                        Created by: Admin {/* We might need to fetch creator name if not in channel object, usually it is admin */}
                    </div>
                </div>

                <div className="members-section" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                    {/* Join Requests Section (Admin Only) */}
                    {user.id === channel.admin && channel.joinRequests && channel.joinRequests.length > 0 && (
                        <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #444' }}>
                            <h4 style={{ color: '#eb9b34' }}>Join Requests ({channel.joinRequests.length})</h4>
                            {channel.joinRequests.map(request => (
                                <div key={request._id} className="request-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: 'rgba(235, 155, 52, 0.1)', padding: '10px', borderRadius: '5px' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{request.username}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{request.email}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/approve`, { channelId: channel._id, userId: request._id }, { headers: { 'x-auth-token': token } });
                                                    toast.success('Approved');
                                                    refreshData(); // Need global refresh or socket event handling to really update UI cleanly
                                                    if (onClose) onClose(); // Close for now as data needs sync
                                                } catch (err) { toast.error('Failed'); }
                                            }}
                                            style={{ background: '#3ba55c', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/reject`, { channelId: channel._id, userId: request._id }, { headers: { 'x-auth-token': token } });
                                                    toast.info('Rejected');
                                                    refreshData();
                                                    if (onClose) onClose();
                                                } catch (err) { toast.error('Failed'); }
                                            }}
                                            style={{ background: '#ed4245', border: 'none', color: 'white', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <h4>Members ({channel.members.length})</h4>
                    <div className="members-list">
                        {channel.members.map(member => (
                            <div key={member._id} className="member-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div className="member-avatar">
                                        {member.username.charAt(0).toUpperCase()}
                                        {/* Status Dot */}
                                        {(onlineUsers && (onlineUsers.has(member._id) || member.isOnline || member._id === user.id)) && (
                                            <div className="member-status online" style={{ position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#10b981', border: '2px solid #262626' }}></div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: member._id === (user._id || user.id) ? 'bold' : 'normal' }}>
                                            {// Show "You" if self, "Admin" if admin
                                                member.username} {member._id === (user._id || user.id) ? '(You)' : ''} {channel.admin === member._id ? '(Admin)' : ''}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>{member.email}</div>
                                    </div>
                                </div>
                                <div className="actions">
                                    {/* Message User - if not self */}
                                    {member._id !== (user._id || user.id) && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/dm`, { recipientId: member._id }, {
                                                        headers: { 'x-auth-token': token }
                                                    });
                                                    if (onChannelSelect) {
                                                        onChannelSelect(res.data);
                                                    }
                                                    onClose();
                                                } catch (err) {
                                                    console.error(err);
                                                    toast.error('Failed to open chat');
                                                }
                                            }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '5px' }}
                                            title="Message"
                                        >
                                            💬
                                        </button>
                                    )}
                                    {/* Add Friend - if not self */}
                                    {member._id !== (user._id || user.id) && (
                                        <button
                                            onClick={() => handleSendRequest(member._id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
                                            title="Add Friend"
                                        >
                                            👤+
                                        </button>
                                    )}
                                    {/* Admin Actions */}
                                    {(user._id || user.id) === channel.admin && member._id !== (user._id || user.id) && (
                                        <button
                                            onClick={() => handleRemoveUser(member._id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', marginLeft: '10px' }}
                                            title="Remove User"
                                        >
                                            ❌
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChannelInfoModal;

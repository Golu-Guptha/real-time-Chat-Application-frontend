import { useContext, useState } from 'react';
import axios from 'axios';
import { AppDataContext } from '../context/AppDataContext';
import { toast } from 'react-toastify';

const JoinRequestsModal = ({ channel, onClose, onChannelUpdate, onRequestProcessed }) => {
    const { refreshData } = useContext(AppDataContext);
    // Initialize local state from props to allow immediate UI updates
    const [requests, setRequests] = useState(channel.joinRequests || []);

    const handleApprove = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/approve`, { channelId: channel._id, userId }, {
                headers: { 'x-auth-token': token }
            });
            toast.success('User approved!');

            // Immediate local update (Modal)
            setRequests(prev => prev.filter(req => (req._id || req) !== userId));

            // Immediate local update (Parent Chat) - wrapped in try-catch
            try {
                if (onRequestProcessed) onRequestProcessed(userId);
            } catch (e) { console.error('Error in onRequestProcessed:', e); }

            // Trigger global refresh - wrapped in try-catch
            try {
                refreshData();
            } catch (e) { console.error('Error in refreshData:', e); }

            try {
                if (onChannelUpdate) await onChannelUpdate();
            } catch (e) { console.error('Error in onChannelUpdate:', e); }
        } catch (err) {
            console.error('Approval error:', err);
            toast.error(err.response?.data?.message || 'Failed to approve');
        }
    };

    const handleReject = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/reject`, { channelId: channel._id, userId }, {
                headers: { 'x-auth-token': token }
            });
            toast.info('Request rejected');

            // Immediate local update
            setRequests(prev => prev.filter(req => (req._id || req) !== userId));

            // Immediate local update (Parent Chat) - wrapped
            try {
                if (onRequestProcessed) onRequestProcessed(userId);
            } catch (e) { console.error('Error in onRequestProcessed:', e); }

            try {
                refreshData();
            } catch (e) { console.error('Error in refreshData:', e); }

            try {
                if (onChannelUpdate) await onChannelUpdate();
            } catch (e) { console.error('Error in onChannelUpdate:', e); }
        } catch (err) {
            console.error('Reject error:', err);
            toast.error(err.response?.data?.message || 'Failed to reject');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '500px', width: '90%' }}>
                <div className="modal-header">
                    <h3>Join Requests for #{channel.name}</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <div className="requests-list" style={{ maxHeight: '400px', overflowY: 'auto', padding: '10px' }}>
                    {(!requests || requests.length === 0) && (
                        <p style={{ textAlign: 'center', color: '#888' }}>No pending requests.</p>
                    )}

                    {requests.map((request, index) => {
                        // Safety check if request is string or object
                        const reqId = request._id || request;
                        const reqName = request.username || 'Unknown User';
                        const reqEmail = request.email || 'No email';

                        // If it's just a string, we might not have details, but we should render something safe
                        if (!reqId) return null;

                        return (
                            <div key={reqId} className="request-item" style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '10px',
                                background: '#2a2a2a',
                                padding: '15px',
                                borderRadius: '8px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{reqName}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{reqEmail}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => handleApprove(reqId)}
                                        style={{ background: '#3ba55c', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '5px', cursor: 'pointer' }}
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleReject(reqId)}
                                        style={{ background: '#ed4245', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '5px', cursor: 'pointer' }}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default JoinRequestsModal;

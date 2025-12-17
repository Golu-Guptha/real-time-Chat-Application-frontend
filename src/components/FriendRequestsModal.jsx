import { useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { AppDataContext } from '../context/AppDataContext';
import { toast } from 'react-toastify';

const FriendRequestsModal = ({ onClose }) => {
    const { friendRequests, refreshData } = useContext(AppDataContext);

    const handleRespond = async (requestId, status) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${import.meta.env.VITE_API_URL}/api/users/friend-request/respond`, {
                requestId,
                status
            }, {
                headers: { 'x-auth-token': token }
            });
            toast.success(`Request ${status}`);
            refreshData();
        } catch (err) {
            console.error(err);
            toast.error('Failed to respond');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <div className="modal-header">
                    <h3>Friend Requests</h3>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>
                <div className="requests-list">
                    {friendRequests.length === 0 ? (
                        <p style={{ padding: '20px', color: '#888', textAlign: 'center' }}>No pending requests</p>
                    ) : (
                        friendRequests.map(req => (
                            <div key={req._id} className="request-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #444' }}>
                                <div>
                                    <span style={{ fontWeight: 'bold' }}>{req.sender.username}</span>
                                    <br />
                                    <small>{req.sender.email}</small>
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => handleRespond(req._id, 'accepted')} className="btn-primary" style={{ padding: '5px 10px' }}>Accept</button>
                                    <button onClick={() => handleRespond(req._id, 'rejected')} className="delete-btn" style={{ padding: '5px 10px' }}>Reject</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default FriendRequestsModal;

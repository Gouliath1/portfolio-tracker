'use client';

import { useState } from 'react';
import { RawPosition } from '../types/portfolio';

interface TransactionManagerProps {
    positions: RawPosition[];
    onPositionsChange: (positions: RawPosition[]) => void;
}

interface AddTransactionFormData {
    transactionDate: string;
    ticker: string;
    fullName: string;
    account: string;
    quantity: number;
    costPerUnit: number;
    baseCcy: string;
    transactionFx: number;
}

export const TransactionManager = ({ positions, onPositionsChange }: TransactionManagerProps) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
    const [recentlyDeleted, setRecentlyDeleted] = useState<{
        position: RawPosition;
        index: number;
    } | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<AddTransactionFormData>({
        transactionDate: new Date().toISOString().split('T')[0],
        ticker: '',
        fullName: '',
        account: 'JP General',
        quantity: 0,
        costPerUnit: 0,
        baseCcy: 'JPY',
        transactionFx: 1.0
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'quantity' || name === 'costPerUnit' || name === 'transactionFx' 
                ? parseFloat(value) || 0 
                : value
        }));
    };

    const handleAddTransaction = async () => {
        if (!formData.ticker || !formData.fullName || formData.quantity <= 0 || formData.costPerUnit <= 0) {
            alert('Please fill in all required fields with valid values');
            return;
        }

        setSaving(true);
        try {
            // Convert date format from YYYY-MM-DD to YYYY/MM/DD
            const formattedDate = formData.transactionDate.replace(/-/g, '/');
            
            const newPosition: RawPosition = {
                transactionDate: formattedDate,
                ticker: formData.ticker,
                fullName: formData.fullName,
                account: formData.account,
                quantity: formData.quantity,
                costPerUnit: formData.costPerUnit,
                transactionCcy: formData.baseCcy, // Map baseCcy to transactionCcy
                stockCcy: formData.baseCcy, // Assume stock currency is same as transaction currency for now
                broker: 'Default', // Add default broker if not provided
            };

            const updatedPositions = [...positions, newPosition];
            
            // Save to API
            const response = await fetch('/api/positions/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ positions: updatedPositions })
            });

            if (!response.ok) {
                throw new Error('Failed to save transaction');
            }

            onPositionsChange(updatedPositions);
            setShowAddForm(false);
            
            // Reset form
            setFormData({
                transactionDate: new Date().toISOString().split('T')[0],
                ticker: '',
                fullName: '',
                account: 'JP General',
                quantity: 0,
                costPerUnit: 0,
                baseCcy: 'JPY',
                transactionFx: 1.0
            });
        } catch (error) {
            console.error('Error adding transaction:', error);
            alert('Failed to add transaction. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTransaction = async (index: number) => {
        setSaving(true);
        try {
            const positionToDelete = positions[index];
            const updatedPositions = positions.filter((_, i) => i !== index);
            
            // Save to API
            const response = await fetch('/api/positions/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ positions: updatedPositions })
            });

            if (!response.ok) {
                throw new Error('Failed to delete transaction');
            }

            onPositionsChange(updatedPositions);
            setRecentlyDeleted({ position: positionToDelete, index });
            setDeleteConfirm(null);
            
            // Auto-clear undo option after 10 seconds
            setTimeout(() => setRecentlyDeleted(null), 10000);
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Failed to delete transaction. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleUndoDelete = async () => {
        if (!recentlyDeleted) return;

        setSaving(true);
        try {
            const updatedPositions = [...positions];
            updatedPositions.splice(recentlyDeleted.index, 0, recentlyDeleted.position);
            
            // Save to API
            const response = await fetch('/api/positions/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ positions: updatedPositions })
            });

            if (!response.ok) {
                throw new Error('Failed to restore transaction');
            }

            onPositionsChange(updatedPositions);
            setRecentlyDeleted(null);
        } catch (error) {
            console.error('Error restoring transaction:', error);
            alert('Failed to restore transaction. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Transaction Management</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    >
                        Add Transaction
                    </button>
                </div>
            </div>

            {/* Undo Delete Notification */}
            {recentlyDeleted && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex justify-between items-center">
                    <span className="text-yellow-800">
                        Deleted transaction: {recentlyDeleted.position.fullName}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={handleUndoDelete}
                            disabled={saving}
                            className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                        >
                            Undo
                        </button>
                        <button
                            onClick={() => setRecentlyDeleted(null)}
                            className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Add Transaction Form */}
            {showAddForm && (
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <h3 className="text-lg font-medium mb-4">Add New Transaction</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                name="transactionDate"
                                value={formData.transactionDate}
                                onChange={handleInputChange}
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ticker</label>
                            <input
                                type="text"
                                name="ticker"
                                value={formData.ticker}
                                onChange={handleInputChange}
                                placeholder="e.g., AAPL, 7203.T"
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input
                                type="text"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleInputChange}
                                placeholder="e.g., Apple Inc."
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                            <select
                                name="account"
                                value={formData.account}
                                onChange={handleInputChange}
                                className="w-full p-2 border border-gray-300 rounded-md"
                            >
                                <option value="JP General">JP General</option>
                                <option value="JP NISA">JP NISA</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                                type="number"
                                name="quantity"
                                value={formData.quantity}
                                onChange={handleInputChange}
                                min="0.01"
                                step="0.01"
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cost Per Unit</label>
                            <input
                                type="number"
                                name="costPerUnit"
                                value={formData.costPerUnit}
                                onChange={handleInputChange}
                                min="0.01"
                                step="0.01"
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                            <select
                                name="baseCcy"
                                value={formData.baseCcy}
                                onChange={handleInputChange}
                                className="w-full p-2 border border-gray-300 rounded-md"
                            >
                                <option value="JPY">JPY</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">FX Rate (to JPY)</label>
                            <input
                                type="number"
                                name="transactionFx"
                                value={formData.transactionFx}
                                onChange={handleInputChange}
                                min="0.01"
                                step="0.01"
                                className="w-full p-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={handleAddTransaction}
                            disabled={saving}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Add Transaction'}
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Transactions List */}
            <div className="space-y-2">
                <h3 className="text-lg font-medium">Recent Transactions</h3>
                <div className="max-h-96 overflow-y-auto">
                    {positions.length === 0 ? (
                        <p className="text-gray-500 py-4">No transactions found</p>
                    ) : (
                        positions.map((position, index) => (
                            <div key={index} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                                <div className="flex-1">
                                    <div className="flex items-center gap-4">
                                        <span className="font-medium">{position.fullName}</span>
                                        <span className="text-sm text-gray-500">({position.ticker})</span>
                                        <span className="text-sm text-gray-500">{position.transactionDate}</span>
                                        <span className="text-sm">{position.quantity} shares</span>
                                        <span className="text-sm text-gray-500">{position.account}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {deleteConfirm === index ? (
                                        <>
                                            <button
                                                onClick={() => handleDeleteTransaction(index)}
                                                disabled={saving}
                                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                            >
                                                Confirm Delete
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(null)}
                                                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirm(index)}
                                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

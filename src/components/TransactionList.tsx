import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ShoppingBag, 
  Coffee, 
  Home, 
  Car, 
  Heart, 
  Plus,
  Loader2,
  Briefcase,
  School,
  Film,
  User,
  DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AddTransactionDialog from "./AddTransactionDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useAuth } from "./AuthProvider";

interface Transaction {
  id: string;
  name: string;
  amount: string;
  type: "expense" | "income";
  category: string;
  date: string;
}

// Format a date from ISO string to a user-friendly format
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${format(date, "h:mm a")}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${format(date, "h:mm a")}`;
  } else {
    return format(date, "MMM d, yyyy, h:mm a");
  }
};

// Format a decimal amount to a currency string
const formatAmount = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount);
};

const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case "shopping":
      return <ShoppingBag size={16} />;
    case "food":
      return <Coffee size={16} />;
    case "housing":
      return <Home size={16} />;
    case "transport":
      return <Car size={16} />;
    case "healthcare":
      return <Heart size={16} />;
    case "education":
      return <School size={16} />;
    case "entertainment":
      return <Film size={16} />;
    case "personal":
      return <User size={16} />;
    case "other":
      return <Briefcase size={16} />;
    default:
      return <DollarSign size={16} />;
  }
};

const TransactionItem = ({ transaction }: { transaction: Transaction }) => {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center",
          transaction.type === "expense" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
        )}>
          {getCategoryIcon(transaction.category)}
        </div>
        <div>
          <p className="font-medium text-sm">{transaction.name}</p>
          <p className="text-xs text-muted-foreground">{transaction.date}</p>
        </div>
      </div>
      <div className={cn(
        "font-medium",
        transaction.type === "expense" ? "text-red-600" : "text-green-600"
      )}>
        {transaction.type === "expense" ? "-" : "+"}
        {transaction.amount}
      </div>
    </div>
  );
};

const TransactionList = () => {
  const { toast } = useToast();
  const { userId } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Fetching transactions for user ID:", userId);
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      if (data) {
        console.log("Fetched transactions:", data);
        
        const formattedTransactions = data.map(item => ({
          id: item.id,
          name: item.name,
          amount: formatAmount(Number(item.amount)),
          type: item.type as "expense" | "income",
          category: item.category,
          date: formatDate(item.date)
        }));
        
        setTransactions(formattedTransactions);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError("Failed to load transactions. Please try again later.");
      toast({
        title: "Error",
        description: "Failed to load transactions. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateBudget = async (category: string, amount: number) => {
    if (!userId || !category) return;
    
    try {
      console.log(`Updating budget for category: ${category}, amount: ${amount}`);
      
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (budgetError) throw budgetError;
      
      if (budgets && budgets.length > 0) {
        const budget = budgets[0];
        const newSpent = parseFloat(budget.spent) + amount;
        const percentageUsed = (newSpent / budget.total) * 100;
        
        console.log(`Current budget: ${budget.spent}, New spent: ${newSpent}, Percentage: ${percentageUsed}%`);
        
        const { error: updateError } = await supabase
          .from('budgets')
          .update({ spent: newSpent })
          .eq('id', budget.id);
          
        if (updateError) throw updateError;
        
        console.log(`Budget for ${category} updated: ₹${newSpent}`);
        
        // Trigger budget alert check if threshold is reached
        if (percentageUsed >= 75) {
          console.log(`Budget threshold reached: ${percentageUsed}%, sending alert for ${category}`);
          
          try {
            // Call the budget-notifications edge function
            const { data, error } = await supabase.functions.invoke('budget-notifications', {
              body: {
                budget_id: budget.id,
                user_id: userId,
                category: category,
                percentage_used: percentageUsed
              }
            });
            
            if (error) {
              console.error("Error sending budget alert:", error);
            } else {
              console.log("Budget alert response:", data);
            }
          } catch (alertError) {
            console.error("Error sending budget alert:", alertError);
          }
        }
        
        const event = new CustomEvent('budget-update');
        window.dispatchEvent(event);
      } else {
        console.log(`No budget found for category: ${category}`);
      }
    } catch (err) {
      console.error("Error updating budget:", err);
    }
  };

  const handleAddTransaction = async (newTransaction: any) => {
    if (!userId) {
      toast({
        title: "Authentication error",
        description: "You must be logged in to add transactions",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log("Adding new transaction:", newTransaction);
      
      // Parse the amount from the formatted string
      let numericAmount = newTransaction.amount;
      if (typeof numericAmount === 'string') {
        if (numericAmount.startsWith('₹')) {
          numericAmount = numericAmount.substring(1);
        }
        numericAmount = numericAmount.replace(/,/g, '');
      }
      const parsedAmount = parseFloat(numericAmount);
      
      if (isNaN(parsedAmount)) {
        throw new Error(`Invalid amount: ${newTransaction.amount}`);
      }
      
      console.log(`Parsed amount: ${parsedAmount}`);
      
      const { data, error } = await supabase
        .from('transactions')
        .insert([
          {
            name: newTransaction.name,
            amount: parsedAmount,
            type: newTransaction.type,
            category: newTransaction.category,
            date: new Date().toISOString(),
            user_id: userId
          }
        ])
        .select();
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        console.log("Transaction added successfully:", data[0]);
        
        const formattedTransaction = {
          id: data[0].id,
          name: data[0].name,
          amount: formatAmount(Number(data[0].amount)),
          type: data[0].type,
          category: data[0].category,
          date: formatDate(data[0].date)
        };
        
        // Update the state with the new transaction
        setTransactions(prevTransactions => [formattedTransaction, ...prevTransactions]);
        
        if (newTransaction.type === 'expense') {
          await updateBudget(newTransaction.category, parsedAmount);
        }
        
        await updateAccountBalance(parsedAmount, newTransaction.type);
        
        toast({
          title: "Transaction added",
          description: `${newTransaction.name} has been added to your transactions.`,
        });
        
        // Create a notification
        try {
          await supabase
            .from('notifications')
            .insert({
              user_id: userId,
              title: `New ${newTransaction.type}: ${newTransaction.name}`,
              message: `You have ${newTransaction.type === 'expense' ? 'spent' : 'received'} ${formatAmount(parsedAmount)} on ${newTransaction.name}`,
              read: false
            });
          
          console.log("Transaction notification created");
        } catch (notificationError) {
          console.error("Error creating notification:", notificationError);
        }
        
        const event = new CustomEvent('transaction-update');
        window.dispatchEvent(event);
      }
    } catch (err) {
      console.error("Error adding transaction:", err);
      toast({
        title: "Error",
        description: "Failed to add transaction. Please try again later.",
        variant: "destructive",
      });
    }
  };

  const updateAccountBalance = async (amount: number, type: string) => {
    if (!userId) return;
    
    try {
      console.log(`Updating account balance: ${amount}, type: ${type}`);
      
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId);
        
      if (accountsError) throw accountsError;
      
      if (accounts && accounts.length > 0) {
        const account = accounts[0];
        let newBalance = parseFloat(account.balance);
        
        if (type === 'expense') {
          newBalance -= amount;
        } else {
          newBalance += amount;
        }
        
        console.log(`Current balance: ${account.balance}, New balance: ${newBalance}`);
        
        const { error: updateError } = await supabase
          .from('accounts')
          .update({ balance: newBalance })
          .eq('id', account.id);
          
        if (updateError) throw updateError;
        
        console.log(`Account ${account.name} balance updated to: ₹${newBalance}`);
      } else {
        console.log("No account found for user");
      }
    } catch (err) {
      console.error("Error updating account balance:", err);
    }
  };

  const handleDownload = () => {
    const headers = ["Id", "Name", "Amount", "Type", "Category", "Date"];
    const csvContent = [
      headers.join(","),
      ...transactions.map(transaction => 
        [
          transaction.id,
          transaction.name,
          transaction.amount,
          transaction.type,
          transaction.category,
          transaction.date
        ].join(",")
      )
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "transactions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Download complete",
      description: "Your transactions have been downloaded as a CSV file.",
    });
  };

  useEffect(() => {
    const handleFilterEvent = (event: CustomEvent) => {
      if (!userId) return;
      
      const filters = event.detail;
      setIsLoading(true);
      
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);
      
      if (filters.dateFrom && filters.dateTo) {
        query = query.gte('date', filters.dateFrom).lte('date', filters.dateTo);
      }
      
      if (filters.account && filters.account !== 'all') {
      }
      
      if (filters.category && filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      
      if (filters.type && filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }
      
      if (filters.searchQuery) {
        query = query.ilike('name', `%${filters.searchQuery}%`);
      }
      
      query.order('date', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error("Error filtering transactions:", error);
            toast({
              title: "Error",
              description: "Failed to apply filters. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          if (data) {
            const formattedTransactions = data.map(item => ({
              id: item.id,
              name: item.name,
              amount: formatAmount(Number(item.amount)),
              type: item.type,
              category: item.category,
              date: formatDate(item.date)
            }));
            
            setTransactions(formattedTransactions);
          }
          
          setIsLoading(false);
        });
    };
    
    window.addEventListener('filter-transactions', handleFilterEvent as EventListener);
    
    return () => {
      window.removeEventListener('filter-transactions', handleFilterEvent as EventListener);
    };
  }, [userId, toast]);

  useEffect(() => {
    if (userId) {
      fetchTransactions();
    }
    
    const handleDownloadEvent = () => {
      handleDownload();
    };
    
    const handleRefreshEvent = () => {
      fetchTransactions();
    };
    
    window.addEventListener('download-transactions', handleDownloadEvent);
    window.addEventListener('refresh-transactions', handleRefreshEvent);
    
    return () => {
      window.removeEventListener('download-transactions', handleDownloadEvent);
      window.removeEventListener('refresh-transactions', handleRefreshEvent);
    };
  }, [userId]);

  if (isLoading && transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-medium">Recent Transactions</CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 gap-1"
              disabled
            >
              <span>Download</span>
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              className="h-8 gap-1"
              disabled
            >
              <Plus size={16} />
              <span>Add Transaction</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading transactions...</p>
        </CardContent>
      </Card>
    );
  }

  if (error && transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-medium">Recent Transactions</CardTitle>
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 gap-1"
            onClick={() => fetchTransactions()}
          >
            <span>Retry</span>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => fetchTransactions()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium">Recent Transactions</CardTitle>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-1"
            onClick={handleDownload}
          >
            <span>Download</span>
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            className="h-8 gap-1"
            onClick={() => setDialogOpen(true)}
          >
            <Plus size={16} />
            <span>Add Transaction</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-sm text-muted-foreground">No transactions found</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              Add Your First Transaction
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {isLoading && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {transactions.map((transaction) => (
              <TransactionItem key={transaction.id} transaction={transaction} />
            ))}
          </div>
        )}
      </CardContent>
      
      <AddTransactionDialog 
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddTransaction={handleAddTransaction}
      />
    </Card>
  );
};

export default TransactionList;

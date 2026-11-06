import { createContext, useContext, useState, useEffect } from "react";
import { Laptop } from "../data";

export interface CartItem {
  laptop: Laptop;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (laptop: Laptop, quantity?: number) => void;
  removeFromCart: (laptopId: string) => void;
  updateQuantity: (laptopId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const getStockLimit = (laptop: Laptop) => (
  Number.isInteger(laptop.countInStock) && laptop.countInStock! >= 0
    ? laptop.countInStock!
    : Number.POSITIVE_INFINITY
);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("cart");
      if (savedCart) {
        const savedItems = JSON.parse(savedCart) as CartItem[];
        setItems(savedItems
          .filter(({ laptop, quantity }) => laptop && Number.isInteger(quantity) && quantity > 0)
          .map(({ laptop, quantity }) => ({
            laptop,
            quantity: Math.min(quantity, getStockLimit(laptop)),
          }))
          .filter(({ quantity }) => quantity > 0));
      }
    } catch {
      try {
        localStorage.removeItem("cart");
      } catch {
        setItems([]);
      }
    } finally {
      setHasLoadedCart(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedCart) return;
    try {
      localStorage.setItem("cart", JSON.stringify(items));
    } catch {
      return;
    }
  }, [hasLoadedCart, items]);

  // Listen for logout event from AuthContext - auto clear cart on logout
  useEffect(() => {
    const handleLogout = () => {
      setItems([]);
      try {
        localStorage.removeItem("cart");
      } catch {
        return;
      }
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const addToCart = (laptop: Laptop, quantity: number = 1) => {
    if (!Number.isInteger(quantity) || quantity <= 0) return;
    const stockLimit = getStockLimit(laptop);
    if (stockLimit === 0) return;

    setItems((prevItems) => {
      const laptopId = laptop.id || laptop._id;
      const existingItem = prevItems.find((item) => (item.laptop.id || item.laptop._id) === laptopId);
      if (existingItem) {
        return prevItems.map((item) =>
          (item.laptop.id || item.laptop._id) === laptopId
            ? { ...item, laptop, quantity: Math.min(item.quantity + quantity, stockLimit) }
            : item
        );
      }
      return [
        ...prevItems,
        {
          laptop,
          quantity: Math.min(quantity, stockLimit),
        },
      ];
    });
  };

  const removeFromCart = (laptopId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.laptop.id !== laptopId));
  };

  const updateQuantity = (laptopId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(laptopId);
      return;
    }
    if (!Number.isInteger(quantity)) return;
    setItems((prevItems) =>
      prevItems.map((item) =>
        (item.laptop.id || item.laptop._id) === laptopId
          ? { ...item, quantity: Math.min(quantity, getStockLimit(item.laptop)) }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

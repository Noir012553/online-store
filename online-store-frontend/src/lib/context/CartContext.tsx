import { createContext, useContext, useState, useEffect } from "react";
import { Laptop } from "../data";

export interface CartItem {
  laptop: Laptop;
  quantity: number;
  unitPrice: number; // Price snapshot at time of adding to cart
  currencyCode: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (laptop: Laptop, quantity?: number) => void;
  removeFromCart: (laptopId: string) => void;
  updateQuantity: (laptopId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>([]);
  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      const savedItems = JSON.parse(savedCart) as CartItem[];
      setItems(
        savedItems.map((item) => ({
          ...item,
          currencyCode: item.currencyCode,
        }))
      );
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  // Listen for logout event from AuthContext - auto clear cart on logout
  useEffect(() => {
    const handleLogout = () => {
      setItems([]);
      localStorage.removeItem("cart");
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const addToCart = (laptop: Laptop, quantity: number = 1) => {
    setItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.laptop.id === laptop.id);
      if (existingItem) {
        return prevItems.map((item) =>
          item.laptop.id === laptop.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prevItems,
        {
          laptop,
          quantity,
          unitPrice: laptop.price,
          currencyCode: laptop.baseCurrencyCode,
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
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.laptop.id === laptopId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
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

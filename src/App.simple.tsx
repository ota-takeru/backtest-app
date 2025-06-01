import React from "react";

export default function App() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold">Simple Test App</h1>
      <p className="mt-4">If you can see this, React is working!</p>
      <button
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        onClick={() => alert("Button clicked!")}
      >
        Test Button
      </button>
    </div>
  );
}

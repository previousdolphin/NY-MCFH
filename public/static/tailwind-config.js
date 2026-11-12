tailwind.config = {
  theme: {
    extend: {
      colors: { brand: { red: '#cc191c', green: '#2d6a4f', black: '#111111', cream: '#f4f4f0' } },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Oswald', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
      boxShadow: {
        brutal: '6px 6px 0px 0px rgba(17, 17, 17, 1)',
        'brutal-hover': '2px 2px 0px 0px rgba(17, 17, 17, 1)',
      },
    },
  },
};

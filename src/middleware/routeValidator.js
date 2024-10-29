const validateRoutes = (router) => {
  router.stack.forEach((route) => {
    if (route.route) {
      Object.keys(route.route.methods).forEach((method) => {
        if (typeof route.route.stack[0].handle !== 'function') {
          throw new Error(`Route ${route.route.path} ${method.toUpperCase()} handler is not a function`);
        }
      });
    }
  });
};

module.exports = validateRoutes;

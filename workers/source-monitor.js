// One outstanding notification prevents a frozen tab from accumulating a message backlog.
let pending = false;
self.onmessage = () => { pending = false; };
setInterval(() => {
    if (pending) return;
    pending = true; self.postMessage('check');
}, 500);

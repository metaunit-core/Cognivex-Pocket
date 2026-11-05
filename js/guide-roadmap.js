(function (global) {
  'use strict';
  function create(labels) {
    const wrapper=document.createElement('div');wrapper.className='guide-roadmap';
    const namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg');
    svg.setAttribute('viewBox','0 0 500 92');svg.setAttribute('role','img');svg.setAttribute('aria-label',labels.join(' → '));
    const spacing=400/(labels.length-1);
    const line=document.createElementNS(namespace,'path');line.setAttribute('d','M50 28H450');line.setAttribute('class','guide-roadmap-line');svg.append(line);
    labels.forEach((label,index)=>{
      const position=50+index*spacing,circle=document.createElementNS(namespace,'circle'),text=document.createElementNS(namespace,'text');
      circle.setAttribute('cx',String(position));circle.setAttribute('cy','28');circle.setAttribute('r','9');
      text.setAttribute('x',String(position));text.setAttribute('y','68');text.setAttribute('text-anchor','middle');text.textContent=label;svg.append(circle,text);
    });
    wrapper.append(svg);return wrapper;
  }
  global.PocketGuideRoadmap=Object.freeze({create});
})(globalThis);

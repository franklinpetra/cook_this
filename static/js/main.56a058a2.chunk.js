(this.webpackJsonpcook_this=this.webpackJsonpcook_this||[]).push([[0],{19:function(e,t,a){e.exports=a(45)},44:function(e,t,a){},45:function(e,t,a){"use strict";a.r(t);var n=a(0),r=a.n(n),c=a(16),i=a.n(c),l=a(4),o=a.n(l),u=a(17),s=a(2),m=a(3),p=function(e){return e.ingredients.map((function(e){return r.a.createElement("ul",{key:Object(m.v4)(),className:"ingredient-list"},r.a.createElement("li",{className:"ingredient-text"},e.text))}))},f=function(e){var t=e.recipe,a=Object(n.useState)(!1),c=Object(s.a)(a,2),i=c[0],l=c[1],o=t.recipe,u=o.label,m=o.image,f=o.url,d=o.ingredients;return r.a.createElement("div",{className:"recipe"},r.a.createElement("h2",null,u),r.a.createElement("img",{src:m,alt:u}),r.a.createElement("a",{href:f,target:"_blank",rel:"noopener noreferrer"},"Recipe Link"),r.a.createElement("button",{onClick:function(){return l(!i)}},"Ingredients"),i&&r.a.createElement(p,{ingredients:d}))},d=function(e){var t=e.alert;return r.a.createElement("div",{className:"alert"},r.a.createElement("h3",null,t))},h=a(18),b=a.n(h),E=(a(44),function(){var e=Object(n.useState)(""),t=Object(s.a)(e,2),a=t[0],c=t[1],i=Object(n.useState)([]),l=Object(s.a)(i,2),p=l[0],h=l[1],E=Object(n.useState)(""),g=Object(s.a)(E,2),v=g[0],k=g[1],j="https://api.edamam.com/search?q=".concat(a,"&app_id=").concat("f57e7a64","&app_key=").concat("6d8a60405bebea5ea56356fa7f5cfcd3"),O=function(){var e=Object(u.a)(o.a.mark((function e(){var t;return o.a.wrap((function(e){for(;;)switch(e.prev=e.next){case 0:if(""===a){e.next=12;break}return e.next=3,b.a.get(j);case 3:if((t=e.sent).data.more){e.next=6;break}return e.abrupt("return",k("can't find a food with that ingredient or one with that name"));case 6:console.log(t),h(t.data.hits),c(""),k(""),e.next=13;break;case 12:k("Try searching for chocolate");case 13:case"end":return e.stop()}}),e)})));return function(){return e.apply(this,arguments)}}();return r.a.createElement("div",null,r.a.createElement("div",{className:"App"},r.a.createElement("h1",null,"Ingredient Searching App"),r.a.createElement("form",{className:"search-form",onSubmit:function(e){e.preventDefault(),O()}},""!==v&&r.a.createElement(d,{alert:v}),r.a.createElement("input",{type:"text",value:a,placeholder:"Search via ingredients or a recipe name",autoComplete:"off",onChange:function(e){return c(e.target.value)}}),r.a.createElement("input",{type:"submit",value:"Search"})),r.a.createElement("div",{className:"recipes"},p!==[]&&p.map((function(e){return r.a.createElement(f,{key:Object(m.v4)(),recipe:e})})))))});i.a.render(r.a.createElement(E,null),document.getElementById("root"))}},[[19,1,2]]]);
//# sourceMappingURL=main.56a058a2.chunk.js.map
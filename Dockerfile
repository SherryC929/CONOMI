FROM nginx:stable-alpine
COPY index.html style.css script.js /usr/share/nginx/html/
COPY Coco.jpg Nono.jpg Mimi.jpg CoNoMi.jpg /usr/share/nginx/html/
EXPOSE 80

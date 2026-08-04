FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /usr/local/bin/imyemail-gateway-entrypoint
RUN chmod 0755 /usr/local/bin/imyemail-gateway-entrypoint
ENTRYPOINT ["/usr/local/bin/imyemail-gateway-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]

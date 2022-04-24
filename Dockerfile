FROM denoland/deno
EXPOSE 9000
VOLUME [ "/data"]
WORKDIR /
COPY ./*.ts ./
RUN deno cache deps.ts
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "app.ts"]
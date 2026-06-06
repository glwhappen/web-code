FROM docker/sandbox-templates:gemini

USER root
COPY shared/install-cloudcli.sh /tmp/install-cloudcli.sh
RUN chmod +x /tmp/install-cloudcli.sh && /tmp/install-cloudcli.sh

USER agent
RUN npm install -g @glwhappen/web-code && web-code --version

COPY --chown=agent:agent shared/start-cloudcli.sh /home/agent/.cloudcli-start.sh
RUN echo '. ~/.cloudcli-start.sh' >> /home/agent/.bashrc

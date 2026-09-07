FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY collector.py email_notifier.py ./

RUN mkdir -p /data && useradd --system --uid 10001 openvigie && chown -R openvigie:openvigie /app /data

USER openvigie

EXPOSE 8787

CMD ["python", "-u", "collector.py"]

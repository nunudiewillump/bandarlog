"""A constrained pictogram renderer keeps AI-selected icons in Bandarlog's line style."""
from PIL import Image,ImageDraw
import torch

LABELS=[('pot','cocina comida menú chef cooking kitchen meals cooking pot'),('tent','logística transporte campamento camping tent logistics transport'),('megaphone','comunicación carteles familias prensa communication megaphone'),('masks','animación juegos teatro actividades entertainment theater masks'),('tools','infraestructura material montaje herramientas maintenance hammer tools'),('health','salud botiquín sanitario primeros auxilios health first aid kit'),('campfire','coordinación scouts grupo equipo general scout campfire')]

def icon_plan(pipe,name,description=''):
    texts=[(name+' '+description)[:350]]+[label for _,label in LABELS]
    batch=pipe.tokenizer(texts,padding='max_length',max_length=pipe.tokenizer.model_max_length,truncation=True,return_tensors='pt')
    with torch.inference_mode():
        vectors=pipe.text_encoder(batch.input_ids).pooler_output
        similarities=torch.nn.functional.cosine_similarity(vectors[0:1],vectors[1:],dim=-1)
    return LABELS[int(similarities.argmax())][0]

def render_icon(kind):
    image=Image.new('RGBA',(384,384),(0,0,0,0));draw=ImageDraw.Draw(image)
    green='#124d38';gold='#d99a35';width=13
    def line(points,color=green,w=width):draw.line(points,fill=color,width=w,joint='curve')
    if kind=='pot':
        draw.rounded_rectangle((91,151,293,295),radius=27,outline=green,width=width)
        line([(75,149),(309,149)]);line([(152,129),(152,113),(232,113),(232,129)])
        line([(89,177),(58,177),(58,213),(89,213)]);line([(295,177),(326,177),(326,213),(295,213)])
        line([(156,93),(151,78),(160,60)],gold,10);line([(226,93),(221,78),(230,60)],gold,10)
    elif kind=='tent':
        line([(47,300),(192,83),(337,300),(47,300)]);line([(192,83),(192,300)],gold);line([(135,300),(192,208),(249,300)]);line([(50,301),(42,325)]);line([(334,301),(342,325)])
    elif kind=='megaphone':
        line([(82,150),(153,150),(299,92),(299,286),(153,228),(82,228),(82,150)]);line([(147,228),(169,310),(212,310),(185,241)],gold);line([(319,151),(345,135)],gold,10);line([(322,190),(352,190)],gold,10);line([(319,230),(345,245)],gold,10)
    elif kind=='tools':
        line([(108,306),(260,151)],green,27);line([(174,111),(223,61),(316,154),(269,201),(174,111)],gold,20);draw.ellipse((86,292,113,319),outline=gold,width=7)
    elif kind=='health':
        draw.rounded_rectangle((63,119,321,307),radius=27,outline=green,width=width);line([(144,119),(144,81),(240,81),(240,119)]);line([(192,163),(192,261)],gold,24);line([(143,212),(241,212)],gold,24)
    elif kind=='masks':
        draw.rounded_rectangle((60,86,224,262),radius=42,outline=green,width=width);draw.rounded_rectangle((179,155,327,322),radius=40,outline=gold,width=width);line([(95,144),(117,144)]);line([(157,144),(179,144)]);draw.arc((99,165,184,220),0,180,fill=green,width=10);line([(211,212),(231,212)],gold,9);line([(271,212),(291,212)],gold,9)
    else:
        line([(87,305),(291,263)],green,20);line([(96,262),(296,306)],green,20);line([(134,231),(116,190),(184,84),(194,146),(242,112),(271,193),(252,236)],gold,17);line([(182,224),(171,197),(202,158),(224,198),(215,225)],green,10)
    return image

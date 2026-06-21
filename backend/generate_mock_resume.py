import os
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except ImportError:
    import subprocess
    subprocess.check_call(["pip", "install", "reportlab"])
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

def create_resume():
    os.makedirs("resource", exist_ok=True)
    file_path = "resource/Alex_UIDev_Resume.pdf"
    
    c = canvas.Canvas(file_path, pagesize=letter)
    width, height = letter
    
    # Title
    c.setFont("Helvetica-Bold", 20)
    c.drawString(50, height - 50, "Alex Rodriguez")
    
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 70, "San Francisco, CA | alex.rodriguez@example.com | github.com/alex-ui")
    
    c.line(50, height - 80, width - 50, height - 80)
    
    # Summary
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, height - 110, "Summary")
    c.setFont("Helvetica", 11)
    summary_text = [
        "Passionate UI Developer with 5+ years of experience building sleek, modern web applications.",
        "Highly proficient in React, CSS, and modern frontend frameworks.",
        "Exceptional track record of translating Figma designs into pixel-perfect, responsive code."
    ]
    y = height - 130
    for line in summary_text:
        c.drawString(50, y, line)
        y -= 20
        
    # Skills
    y -= 10
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, "Technical Skills")
    y -= 20
    c.setFont("Helvetica", 11)
    skills = "React.js, Next.js, CSS3, Tailwind CSS, TypeScript, Figma, UI/UX Design, Framer Motion."
    c.drawString(50, y, skills)
    
    # Experience
    y -= 30
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, "Professional Experience")
    
    y -= 25
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "Senior Frontend Engineer | TechFlow Innovators | 2021 - Present")
    y -= 20
    c.setFont("Helvetica", 11)
    exp1 = [
        "- Architected a complex dashboard UI in React resulting in a 40% increase in user retention.",
        "- Translated 100+ Figma mocks into scalable component libraries using CSS modules.",
        "- Implemented inline SVG icon systems and modern WebGL animations."
    ]
    for line in exp1:
        c.drawString(60, y, line)
        y -= 20
        
    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "UI Developer | Creative Web Agency | 2018 - 2021")
    y -= 20
    c.setFont("Helvetica", 11)
    exp2 = [
        "- Built highly responsive, sleek corporate websites using modern frontend frameworks.",
        "- Collaborated directly with UI/UX designers to bridge the gap between design and code."
    ]
    for line in exp2:
        c.drawString(60, y, line)
        y -= 20

    c.save()
    print(f"Created: {file_path}")

if __name__ == "__main__":
    create_resume()

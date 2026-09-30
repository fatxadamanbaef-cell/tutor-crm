with open(r'd:\mathvibe project\tutor-crm\src\components\tabs\ScheduleTab.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'g-white rounded' in line:
        lines[i] = '                         className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-transform ${isCompleted || isMissed ? "opacity-60" : ""}`}\n'

with open(r'd:\mathvibe project\tutor-crm\src\components\tabs\ScheduleTab.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

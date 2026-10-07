import OpenAI, { toFile } from 'openai';
import { getStudents, getLessons, addPayment, setLessonStatusDirect, updateLessonTime, logPastCompletedLesson } from './storage';
import { getTashkentTodayStr, getTashkentNow } from './formatters';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processWithAI(text: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '❌ Ключ OPENAI_API_KEY не настроен в файле .env (добавьте его, чтобы ИИ заработал).';
  }

  // 1. Собираем контекст для ИИ (список учеников и уроков на сегодня)
  const students = await getStudents();
  const lessons = await getLessons();
  const today = getTashkentTodayStr();
  
  // Берем сегодняшние уроки + все будущие запланированные, чтобы ИИ мог двигать и завтрашние
  const upcomingLessons = lessons.filter(l => l.date >= today || l.status === 'planned');

  const studentsContext = students.map(s => {
    const notesStr = s.schedule_notes ? ` Шаблон расписания: ${s.schedule_notes}.` : '';
    return `${s.name} (ID: ${s.id}, Баланс: ${s.prepaid_balance} уроков.${notesStr})`;
  }).join('\n');
  const lessonsContext = upcomingLessons.map(l => `Урок с ${l.student_name} дата ${l.date.substring(0, 10)} в ${l.time_str} (ID урока: ${l.id}, Статус: ${l.status})`).join('\n');

  const systemPrompt = `
Ты — личный AI-ассистент частного преподавателя. Твоя задача — управлять расписанием, балансом уроков и финансами в CRM-системе через вызов функций (Function Calling). Ты общаешься только с самим преподавателем (администратором). Твои ответы должны быть краткими, четкими и подтверждающими выполнение действий.

Контекст:
Текущая дата и время (Ташкент): ${getTashkentNow().toISOString()}, Сегодня: ${today}

Список учеников и их расписание:
${studentsContext || 'Нет учеников'}

Предстоящие уроки:
${lessonsContext || 'Нет запланированных уроков'}

Твои обязанности и логика:
- Отметка проведенных уроков: Если преподаватель говорит, что урок прошел, вызови updateLessonStatus со статусом completed.
- Перенос уроков: Если просят перенести урок, вычисли точную дату и вызови rescheduleLesson.
- Оплаты и ретроспективное списание: Если ученик оплатил с опозданием (например, "заплатила за 12 уроков. Должна была 5 сентября, но заплатила 10-го"), ты обязан:
  1) Вызвать addPayment на указанное кол-во уроков.
  2) Вычислить даты занятий, прошедшие с момента возникновения долга до оплаты (опираясь на шаблон расписания ученика).
  3) Вызвать logPastCompletedLesson для каждой из этих прошедших дат, чтобы баланс актуализировался.

Правила общения:
- Никогда не отказывайся выполнять команду, если у тебя есть нужная функция.
- Не проси преподавателя сделать что-то вручную.
- После выполнения функций отвечай кратко.
  `;

  const tools = [
    {
      type: "function",
      function: {
        name: "addPayment",
        description: "Добавляет оплату ученику (пополняет баланс уроков). Используй, когда репетитор говорит 'Алина скинула за 10 уроков' и т.д.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "ID ученика из списка выше" },
            lessonsCount: { type: "number", description: "Количество оплаченных уроков" },
            amountUzs: { type: "number", description: "Сумма в сумах (если не указано явно, можешь не передавать или рассчитать как цена * кол-во)" }
          },
          required: ["studentId", "lessonsCount"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "updateLessonStatus",
        description: "Изменяет статус сегодняшнего урока (проведен, отменен, сгорел).",
        parameters: {
          type: "object",
          properties: {
            lessonId: { type: "string", description: "ID урока из списка сегодняшних уроков" },
            status: { 
                type: "string", 
                enum: ["completed", "missed_excused", "missed_penalty"], 
                description: "completed - урок успешно проведен. missed_excused - отмена по уважительной причине (долг). missed_penalty - отмена без причины (урок сгорает из баланса)." 
            }
          },
          required: ["lessonId", "status"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "rescheduleLesson",
        description: "Изменяет время (и при необходимости дату) запланированного урока.",
        parameters: {
          type: "object",
          properties: {
            lessonId: { type: "string", description: "ID урока" },
            newTimeStr: { type: "string", description: "Новое время в формате 'HH:MM - HH:MM', например '15:00 - 16:30'" },
            newDateStr: { type: "string", description: "Новая дата в формате 'YYYY-MM-DD', если требуется перенос на другой день. Оставь пустым, если меняется только время." }
          },
          required: ["lessonId", "newTimeStr"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "logPastCompletedLesson",
        description: "Создает завершенный урок в прошлом и списывает 1 урок с баланса ученика. Используй для ретроспективных списаний.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "ID ученика" },
            dateStr: { type: "string", description: "Дата проведенного урока в формате 'YYYY-MM-DD'" }
          },
          required: ["studentId", "dateStr"]
        }
      }
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // быстрый и дешевый
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      tools: tools as any,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    // Если ИИ решил вызвать функцию (Tool Call)
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResponses = [];

      for (const toolCall of message.tool_calls) {
        const args = JSON.parse((toolCall as any).function.arguments);
        const functionName = (toolCall as any).function.name;

        try {
          if (functionName === 'addPayment') {
            const student = students.find(s => s.id === args.studentId);
            const amount = args.amountUzs || (student ? student.price_per_lesson * args.lessonsCount : 0);
            await addPayment(args.studentId, amount, args.lessonsCount);
          } else if (functionName === 'updateLessonStatus') {
            await setLessonStatusDirect(args.lessonId, args.status);
          } else if (functionName === 'rescheduleLesson') {
            await updateLessonTime(args.lessonId, args.newTimeStr, args.newDateStr);
          } else if (functionName === 'logPastCompletedLesson') {
            await logPastCompletedLesson(args.studentId, args.dateStr);
          }

          toolResponses.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "✅ Успешно"
          });
        } catch (e: any) {
          console.error("Tool execution error:", e);
          toolResponses.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: "❌ Ошибка: " + e.message
          });
        }
      }

      // Отправляем результат выполнения обратно в ИИ, чтобы он сформировал человечный ответ
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
          message,
          ...toolResponses
        ] as any
      });

      return secondResponse.choices[0].message.content || "Действие успешно выполнено!";
    }

    // Если ИИ просто ответил текстом
    return message.content || "Извини, я не понял.";

  } catch (e: any) {
    console.error("OpenAI AI Error:", e);
    return "❌ Произошла ошибка при обращении к ИИ: " + e.message;
  }
}

export async function transcribeVoice(fileId: string): Promise<string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '8520814142:AAF1jZQZ9WQX6Hv4QRGOizoEwv2GRChtiPw';
  if (!botToken || !process.env.OPENAI_API_KEY) return '';

  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) throw new Error('Telegram getFile failed');

    const audioUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const audioRes = await fetch(audioUrl);
    
    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const file = await toFile(buffer, 'voice.oga', { type: 'audio/ogg' });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
    });

    return transcription.text;
  } catch (e) {
    console.error('Whisper transcription error:', e);
    return '';
  }
}

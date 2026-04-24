const TASK_STATUS_LABELS = {
    open: "未开始",
    progressing: "进行中",
    done: "已完成"
};
const ITERATION_STATUS_LABELS = {
    open: "进行中",
    done: "已完成",
    closed: "已关闭"
};
export function taskStatusLabel(status) {
    if (!status)
        return "-";
    return TASK_STATUS_LABELS[status] ?? status;
}
export function iterationStatusLabel(status) {
    if (!status)
        return "-";
    return ITERATION_STATUS_LABELS[status] ?? status;
}
export function storyStatusLabel(status, statusMap) {
    if (!status)
        return "-";
    return statusMap?.[status] ?? status;
}
//# sourceMappingURL=status.js.map
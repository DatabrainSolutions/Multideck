using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDebtAction
{
    public Guid FindebtActionId { get; set; }

    public Guid FindebtActionCaseId { get; set; }

    public string FindebtActionActionTypeCode { get; set; } = null!;

    public string FindebtActionStatusCode { get; set; } = null!;

    public DateTime FindebtActionActionAt { get; set; }

    public Guid? FindebtActionActionBy { get; set; }

    public Guid? FindebtActionCommThreadId { get; set; }

    public string? FindebtActionNotes { get; set; }

    public DateTime? FindebtActionNextActionDueAt { get; set; }

    public string FindebtActionMetadataJson { get; set; } = null!;

    public virtual CmpUser? FindebtActionActionByNavigation { get; set; }

    public virtual SysFinanceDebtActionType FindebtActionActionTypeCodeNavigation { get; set; } = null!;

    public virtual FinDebtCase FindebtActionCase { get; set; } = null!;

    public virtual CommThread? FindebtActionCommThread { get; set; }
}

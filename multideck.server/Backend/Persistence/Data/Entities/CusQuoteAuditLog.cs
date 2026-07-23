using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteAuditLog
{
    public Guid CusQuoteLogId { get; set; }

    public Guid? CusQuoteLogQuoteId { get; set; }

    public byte[] CusQuoteLogTs { get; set; } = null!;

    public DateTime CusQuoteLogDateTimeUtc { get; set; }

    public DateTime CusQuoteLogDateTimeLocal { get; set; }

    public int CusQuoteLogEventType { get; set; }

    public Guid? CusQuoteLogUserId { get; set; }

    public Guid? CusQuoteLogRevId { get; set; }

    public Guid? CusQuoteLogCostOptId { get; set; }

    public Guid? CusQuoteLogRevenueOptId { get; set; }

    public Guid? CusQuoteLogCostLineId { get; set; }

    public Guid? CusQuoteLogRevenueLineId { get; set; }

    public string? CusQuoteLogNotes { get; set; }
}

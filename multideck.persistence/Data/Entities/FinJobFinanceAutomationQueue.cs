using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobFinanceAutomationQueue
{
    public Guid FinautoQId { get; set; }

    public Guid? FinautoQJobId { get; set; }

    public string? FinautoQSourceTable { get; set; }

    public Guid? FinautoQSourceId { get; set; }

    public string FinautoQActionTypeCode { get; set; } = null!;

    public string FinautoQStatusCode { get; set; } = null!;

    public int FinautoQPriority { get; set; }

    public DateTime? FinautoQNotBeforeAt { get; set; }

    public int FinautoQAttemptCount { get; set; }

    public DateTime? FinautoQLastAttemptAt { get; set; }

    public string? FinautoQLastError { get; set; }

    public string FinautoQContextJson { get; set; } = null!;

    public DateTime FinautoQCreatedAt { get; set; }

    public virtual JobHeader? FinautoQJob { get; set; }
}

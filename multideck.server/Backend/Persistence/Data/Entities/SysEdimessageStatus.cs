using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdimessageStatus
{
    public string EdimsCode { get; set; } = null!;

    public string EdimsName { get; set; } = null!;

    public string? EdimsDescription { get; set; }

    public bool EdimsIsOpen { get; set; }

    public bool EdimsIsFinal { get; set; }

    public bool EdimsIsError { get; set; }

    public bool EdimsIsActive { get; set; }

    public int EdimsSortOrder { get; set; }

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiInboundQueue> EdiInboundQueues { get; set; } = new List<EdiInboundQueue>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiOutboundQueue> EdiOutboundQueues { get; set; } = new List<EdiOutboundQueue>();

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();

    public virtual ICollection<EdiProcessingRun> EdiProcessingRuns { get; set; } = new List<EdiProcessingRun>();

    public virtual ICollection<EdiTestRun> EdiTestRuns { get; set; } = new List<EdiTestRun>();

    public virtual ICollection<EdiWebhookEvent> EdiWebhookEvents { get; set; } = new List<EdiWebhookEvent>();
}

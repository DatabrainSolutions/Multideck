using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdiacknowledgementStatus
{
    public string EdiackStatusCode { get; set; } = null!;

    public string EdiackStatusName { get; set; } = null!;

    public string? EdiackStatusDescription { get; set; }

    public bool EdiackStatusIsOpen { get; set; }

    public bool EdiackStatusIsFinal { get; set; }

    public bool EdiackStatusIsAccepted { get; set; }

    public bool EdiackStatusIsRejected { get; set; }

    public bool EdiackStatusIsActive { get; set; }

    public int EdiackStatusSortOrder { get; set; }

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgements { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();
}

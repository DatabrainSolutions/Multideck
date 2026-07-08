using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommExtractedEntity
{
    public Guid CommEntityId { get; set; }

    public Guid? CommEntityThreadId { get; set; }

    public Guid? CommEntityMessageId { get; set; }

    public Guid? CommEntityAiclassificationId { get; set; }

    public string CommEntityEntityType { get; set; } = null!;

    public string CommEntityValue { get; set; } = null!;

    public string? CommEntityNormalizedValue { get; set; }

    public decimal? CommEntityConfidence { get; set; }

    public string? CommEntityLinkTypeCode { get; set; }

    public string? CommEntityTargetTable { get; set; }

    public Guid? CommEntityTargetId { get; set; }

    public bool CommEntityIsConfirmed { get; set; }

    public DateTime CommEntityCreatedAt { get; set; }

    public virtual CommAiclassification? CommEntityAiclassification { get; set; }

    public virtual SysCommLinkType? CommEntityLinkTypeCodeNavigation { get; set; }

    public virtual CommMessage? CommEntityMessage { get; set; }

    public virtual CommThread? CommEntityThread { get; set; }
}

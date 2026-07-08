using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAiconversationChannel
{
    public string AiccCode { get; set; } = null!;

    public string AiccName { get; set; } = null!;

    public string? AiccDescription { get; set; }

    public int AiccSortOrder { get; set; }

    public bool AiccIsActive { get; set; }

    public DateTime AiccCreatedAt { get; set; }

    public virtual ICollection<AiConversation> AiConversations { get; set; } = new List<AiConversation>();
}

using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAisuggestionStatus
{
    public string AissCode { get; set; } = null!;

    public string AissName { get; set; } = null!;

    public bool AissIsFinal { get; set; }

    public int AissSortOrder { get; set; }

    public bool AissIsActive { get; set; }

    public DateTime AissCreatedAt { get; set; }

    public virtual ICollection<AiSuggestion> AiSuggestions { get; set; } = new List<AiSuggestion>();
}
